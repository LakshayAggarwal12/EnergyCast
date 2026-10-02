"""Storage adapter for NeonDB file buckets (bounded memory, any file size).

The previous version read whole files into RAM on upload and download (a 135 MB CSV briefly needed several hundred
MB). Now:
* CSV files are gzip-compressed while streaming from disk (a text CSV shrinks ~5x, which also saves Neon's 0.5 GB),
* the bytes are written to / read from Postgres in 4 MB slices (`||` append and `substr`), never in one piece,
* downloads are decompressed on the fly straight to disk.
Rows stored by the old version (raw, uncompressed) are still read correctly: gzip data is recognised by its magic
bytes, anything else is copied as-is.
"""
from __future__ import annotations

import gzip
import shutil
import zlib
from pathlib import Path

from sqlalchemy import delete, func, select, update
from sqlalchemy.orm import Session

from app.database.models import FileObject

WRITE_SLICE = 4 * 1024 * 1024
READ_SLICE = 4 * 1024 * 1024
GZIP_MAGIC = b"\x1f\x8b"
COMPRESSED_SUFFIXES = (".csv",)   # parquet and joblib files are already compressed


def _row_id(db: Session, bucket_name: str, file_name: str) -> int | None:
    return db.scalar(select(FileObject.id).where(FileObject.bucket_name == bucket_name, FileObject.file_name == file_name))


def upload_file_to_db(db: Session, bucket_name: str, file_path: str | Path, file_name: str | None = None) -> None:
    path = Path(file_path)
    if not path.exists():
        return
    fname = file_name or path.name
    packed: Path | None = None
    source = path
    if fname.lower().endswith(COMPRESSED_SUFFIXES):
        packed = path.with_name(path.name + ".gz.tmp")
        with open(path, "rb") as src, gzip.open(packed, "wb", compresslevel=5) as dst:
            shutil.copyfileobj(src, dst, 1024 * 1024)
        source = packed
    try:
        with open(source, "rb") as fh:
            first = fh.read(WRITE_SLICE)
            row_id = _row_id(db, bucket_name, fname)
            if row_id is None:
                obj = FileObject(bucket_name=bucket_name, file_name=fname, data=first)
                db.add(obj)
                db.commit()
                row_id = obj.id
                db.expunge(obj)
            else:
                db.execute(update(FileObject).where(FileObject.id == row_id).values(data=first))
                db.commit()
            while chunk := fh.read(WRITE_SLICE):  # append the rest slice by slice
                db.execute(update(FileObject).where(FileObject.id == row_id).values(data=FileObject.data.op("||")(chunk)))
                db.commit()
    finally:
        if packed is not None:
            packed.unlink(missing_ok=True)


def download_file_from_db(db: Session, bucket_name: str, file_name: str, dest_path: str | Path) -> None:
    dest = Path(dest_path)
    if dest.exists():
        return  # already on the (ephemeral) disk
    row_id = _row_id(db, bucket_name, file_name)
    if row_id is None:
        return
    size = db.scalar(select(func.octet_length(FileObject.data)).where(FileObject.id == row_id)) or 0
    dest.parent.mkdir(parents=True, exist_ok=True)
    tmp = dest.with_name(dest.name + ".part")
    try:
        head = db.scalar(select(func.substr(FileObject.data, 1, 2)).where(FileObject.id == row_id)) or b""
        packed = file_name.lower().endswith(COMPRESSED_SUFFIXES) and bytes(head) == GZIP_MAGIC  # only CSVs are ever compressed
        inflate = zlib.decompressobj(16 + zlib.MAX_WBITS) if packed else None
        with open(tmp, "wb") as out:
            offset = 1  # SQL substr is 1-based
            while offset <= size:
                piece = db.scalar(select(func.substr(FileObject.data, offset, READ_SLICE)).where(FileObject.id == row_id))
                if not piece:
                    break
                out.write(inflate.decompress(bytes(piece)) if inflate else bytes(piece))
                offset += READ_SLICE
                db.rollback()  # end the read transaction between slices; nothing is cached on the session
            if inflate:
                out.write(inflate.flush())
        tmp.replace(dest)
    finally:
        tmp.unlink(missing_ok=True)


def delete_file_from_db(db: Session, bucket_name: str, file_name: str) -> None:
    row_id = _row_id(db, bucket_name, file_name)
    if row_id is not None:
        db.execute(delete(FileObject).where(FileObject.id == row_id))
        db.commit()
