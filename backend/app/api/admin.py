from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.database.models import Dataset, ModelRecord, TrainingRun, User
from app.database.session import get_db

router = APIRouter(prefix="/api/admin", tags=["admin"])


@router.get("/overview")
def overview(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Counts for the admin dashboard."""
    by_status = dict(db.execute(select(Dataset.status, func.count()).group_by(Dataset.status)).all())
    runs = db.scalars(select(TrainingRun).order_by(TrainingRun.created_at.desc()).limit(5)).all()
    return {
        "datasets_by_status": by_status,
        "datasets_total": sum(by_status.values()),
        "trained_models": db.scalar(select(func.count()).select_from(ModelRecord).where(ModelRecord.status == "trained")) or 0,
        "users": db.scalar(select(func.count()).select_from(User)) or 0,
        "recent_runs": [
            {"id": r.id, "dataset_id": r.dataset_id, "version": r.version, "status": r.status, "stage": r.stage,
             "created_at": r.created_at.isoformat()}
            for r in runs
        ],
    }
