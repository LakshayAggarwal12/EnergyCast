from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.auth.deps import require_admin
from app.database.models import TrainingRun, User
from app.database.session import get_db
from app.schemas.dataset import DatasetSummary
from app.schemas.training import ModelOut, ModelComparison, TrainingRunDetail, TrainingRunOut, TrainRequest
from app.services import dataset_service, publishing_service, training_service

router = APIRouter(prefix="/api/admin", tags=["admin: models"])


@router.post("/models/train", response_model=TrainingRunOut, status_code=status.HTTP_202_ACCEPTED)
def train_models(
    body: TrainRequest,
    background: BackgroundTasks,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Queue a training run (baselines, ARIMA/SARIMA, Linear Regression, Random Forest, XGBoost).
    Poll GET /api/admin/training-runs/{id} for status."""
    dataset = dataset_service.get_dataset_or_404(db, body.dataset_id)
    run = training_service.create_run(db, dataset, admin.id, body.models)
    background.add_task(training_service.execute_run, run.id)
    return run


@router.get("/models/{dataset_id}", response_model=ModelComparison)
def model_comparison(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    dataset_service.get_dataset_or_404(db, dataset_id)
    return training_service.model_comparison(db, dataset_id)


@router.get("/datasets/{dataset_id}/training-runs", response_model=list[TrainingRunOut])
def list_runs(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    dataset_service.get_dataset_or_404(db, dataset_id)
    return list(db.scalars(select(TrainingRun).where(TrainingRun.dataset_id == dataset_id).order_by(TrainingRun.version.desc())))


@router.get("/training-runs/{run_id}", response_model=TrainingRunDetail)
def get_run(run_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    run = db.get(TrainingRun, run_id)
    if run is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Training run not found.")
    return run


@router.post("/models/{model_id}/publish", response_model=ModelOut)
def publish_model(model_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Make this trained model the one users forecast with (replaces any previously published model).
    A test forecast is run first; models that cannot forecast are refused."""
    return publishing_service.publish_model(db, model_id)


@router.post("/datasets/{dataset_id}/unpublish", response_model=DatasetSummary)
def unpublish_dataset(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    """Withdraw the dataset from users. Existing forecast history is kept."""
    return publishing_service.unpublish_dataset(db, dataset_id)
