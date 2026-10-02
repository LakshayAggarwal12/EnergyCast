"""CSV loading: format sniffing (delimiter, header, quote-wrapped lines) and parsing to Pandas."""
from __future__ import annotations

import io
import itertools
from dataclasses import asdict, dataclass
from pathlib import Path
from typing import Any, Sequence

import pandas as pd

CANDIDATE_DELIMITERS = [",", ";", "\t", "|"]
SNIFF_BYTES = 64 * 1024


class CsvFormatError(ValueError):
    """The file cannot be read as a CSV table."""


@dataclass(frozen=True)
class CsvMeta:
    delimiter: str
    has_header: bool
    wrapped_in_quotes: bool  # every line is wrapped in one pair of double quotes: "a;b;c"
    columns: list[str]

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)

    @classmethod
    def from_dict(cls, data: dict[str, Any]) -> "CsvMeta":
        return cls(**data)


def _is_number(token: str) -> bool:
    try:
        float(token.strip())
        return True
    except ValueError:
        return False


def sniff_csv(path: Path) -> CsvMeta:
    with open(path, "rb") as fh:
        head = fh.read(SNIFF_BYTES)
    if not head:
        raise CsvFormatError("The file is empty.")
    if b"\x00" in head:
        raise CsvFormatError("The file looks binary, not text. Upload a CSV file.")
    try:
        text = head.decode("utf-8-sig")
    except UnicodeDecodeError as exc:
        if exc.start >= len(head) - 4:  # multi-byte character cut by the sniff window
            text = head[: exc.start].decode("utf-8-sig")
        else:
            raise CsvFormatError("The file is not valid UTF-8 text.") from exc

    lines = text.splitlines()
    first = lines[0].strip() if lines else ""
    if not first:
        raise CsvFormatError("The first line of the file is empty.")

    wrapped = len(first) >= 2 and first[0] == '"' and first[-1] == '"' and '"' not in first[1:-1]
    if wrapped:
        first = first[1:-1]

    counts = {d: first.count(d) for d in CANDIDATE_DELIMITERS}
    delimiter = max(counts, key=lambda d: counts[d])
    if counts[delimiter] == 0:
        delimiter = ","
    tokens = [t.strip().strip('"') for t in first.split(delimiter)]

    has_header = not all(_is_number(t) for t in tokens if t != "")
    if has_header:
        if any(t == "" for t in tokens):
            raise CsvFormatError("The header row contains empty column names.")
        if len(set(tokens)) != len(tokens):
            raise CsvFormatError("The header row contains duplicate column names.")
        columns = tokens
    else:
        columns = [f"col_{i}" for i in range(len(tokens))]
    return CsvMeta(delimiter=delimiter, has_header=has_header, wrapped_in_quotes=wrapped, columns=columns)


def read_csv_frame(
    path: Path,
    meta: CsvMeta | None = None,
    na_values: Sequence[str] = ("?",),
    nrows: int | None = None,
) -> pd.DataFrame:
    """Read the CSV as-is. Timestamp columns stay as text; numeric columns are inferred by Pandas."""
    meta = meta or sniff_csv(path)
    
    try:
        # For large files, read directly from file instead of loading into memory first
        if nrows is None and path.stat().st_size > 50 * 1024 * 1024:  # > 50MB
            # Read directly from file for large datasets
            if meta.wrapped_in_quotes:
                # Need to process quotes for wrapped files
                with open(path, "rb") as fh:
                    data = fh.read()
                data = data.replace(b'"', b"")
                df = pd.read_csv(
                    io.BytesIO(data),
                    sep=meta.delimiter,
                    header=0 if meta.has_header else None,
                    names=None if meta.has_header else meta.columns,
                    na_values=list(na_values),
                    encoding="utf-8-sig",
                    low_memory=False,
                )
            else:
                # Read directly from file path (more efficient)
                df = pd.read_csv(
                    path,
                    sep=meta.delimiter,
                    header=0 if meta.has_header else None,
                    names=None if meta.has_header else meta.columns,
                    na_values=list(na_values),
                    encoding="utf-8-sig",
                    low_memory=False,
                )
        else:
            # Original behavior for small files
            with open(path, "rb") as fh:
                if nrows is None:
                    data = fh.read()
                else:
                    data = b"".join(itertools.islice(fh, nrows + (1 if meta.has_header else 0)))
            if meta.wrapped_in_quotes:
                data = data.replace(b'"', b"")
            df = pd.read_csv(
                io.BytesIO(data),
                sep=meta.delimiter,
                header=0 if meta.has_header else None,
                names=None if meta.has_header else meta.columns,
                na_values=list(na_values),
                encoding="utf-8-sig",
                low_memory=False,
            )
        
        df.columns = [str(c).strip() for c in df.columns]
        return df
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
        raise CsvFormatError(f"The CSV could not be parsed: {exc}") from exc


CHUNK_ROWS = 50_000           # rows parsed at a time: about 7 MB of text, so memory stays flat for any file size
SAMPLE_FULL_READ_BYTES = 8 * 1024 * 1024


def _read_chunk(data: bytes, meta: CsvMeta, na_values: Sequence[str]) -> pd.DataFrame:
    if meta.wrapped_in_quotes:
        data = data.replace(b'"', b"")
    try:
        df = pd.read_csv(
            io.BytesIO(data), sep=meta.delimiter, header=None, names=list(meta.columns),
            na_values=list(na_values), encoding="utf-8", low_memory=False,
        )
    except (pd.errors.ParserError, pd.errors.EmptyDataError, UnicodeDecodeError) as exc:
        raise CsvFormatError(f"The CSV could not be parsed: {exc}") from exc
    df.columns = [str(c).strip() for c in df.columns]
    return df


def iter_csv_chunks(
    path: Path, meta: CsvMeta | None = None, na_values: Sequence[str] = ("?",), chunk_rows: int | None = None
):
    """Yield the file as DataFrames of at most `chunk_rows` rows. Peak memory is one chunk, never the whole file
    (the previous implementation read, copied and parsed the entire file at once: ~800 MB for a 135 MB CSV)."""
    meta = meta or sniff_csv(path)
    chunk_rows = chunk_rows or CHUNK_ROWS
    with open(path, "rb") as fh:
        if meta.has_header:
            fh.readline()
        first = True
        while True:
            lines = list(itertools.islice(fh, chunk_rows))
            if not lines:
                break
            data = b"".join(lines)
            del lines
            if first and data.startswith(b"\xef\xbb\xbf"):
                data = data[3:]
            first = False
            yield _read_chunk(data, meta, na_values)


def sample_rows(path: Path, meta: CsvMeta, na_values: Sequence[str] = ("?",), n: int = 4000) -> pd.DataFrame:
    """About `n` rows spread evenly over the whole file (used to detect formats without reading all of it)."""
    size = path.stat().st_size
    if size <= SAMPLE_FULL_READ_BYTES:
        return read_csv_frame(path, meta, na_values=na_values)
    with open(path, "rb") as fh:
        if meta.has_header:
            fh.readline()
        start = fh.tell()
        span = max(size - start, 1)
        lines: list[bytes] = []
        for i in range(n):
            fh.seek(start + span * i // n)
            if i:
                fh.readline()  # drop the partial line we landed in
            line = fh.readline()
            if line.strip():
                lines.append(line if line.endswith(b"\n") else line + b"\n")
    data = b"".join(lines)
    if data.startswith(b"\xef\xbb\xbf"):
        data = data[3:]
    return _read_chunk(data, meta, na_values)


def count_data_rows(path: Path, meta: CsvMeta) -> int:
    lines = 0
    last_byte = b"\n"
    with open(path, "rb") as fh:
        while chunk := fh.read(1024 * 1024):
            lines += chunk.count(b"\n")
            last_byte = chunk[-1:]
    if last_byte != b"\n":
        lines += 1
    return max(lines - (1 if meta.has_header else 0), 0)
