"""Storage adapter for NeonDB file buckets."""
from pathlib import Path
from sqlalchemy.orm import Session
from sqlalchemy import select
from app.database.models import FileObject

def upload_file_to_db(db: Session, bucket_name: str, file_path: str | Path, file_name: str | None = None) -> None:
    path = Path(file_path)
    if not path.exists():
        return
    fname = file_name or path.name
    
    # Check if exists
    obj = db.scalar(select(FileObject).where(FileObject.bucket_name == bucket_name, FileObject.file_name == fname))
    
    with open(path, "rb") as f:
        data = f.read()
        
    if obj:
        obj.data = data
    else:
        obj = FileObject(bucket_name=bucket_name, file_name=fname, data=data)
        db.add(obj)
    db.commit()

def download_file_from_db(db: Session, bucket_name: str, file_name: str, dest_path: str | Path) -> None:
    dest = Path(dest_path)
    if dest.exists():
        return  # Already on ephemeral disk
        
    obj = db.scalar(select(FileObject).where(FileObject.bucket_name == bucket_name, FileObject.file_name == file_name))
    if obj:
        dest.parent.mkdir(parents=True, exist_ok=True)
        with open(dest, "wb") as f:
            f.write(obj.data)

def delete_file_from_db(db: Session, bucket_name: str, file_name: str) -> None:
    obj = db.scalar(select(FileObject).where(FileObject.bucket_name == bucket_name, FileObject.file_name == file_name))
    if obj:
        db.delete(obj)
        db.commit()
