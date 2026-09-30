from fastapi import APIRouter, BackgroundTasks, Depends, File, Form, HTTPException, Response, UploadFile, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user, require_admin
from app.database.models import ROLE_ADMIN, Dataset, DatasetStatus, User
from app.database.session import get_db
from app.schemas.forecast import AvailableDataset
from app.services import publishing_service
from app.schemas.dataset import DatasetConfigIn, DatasetDetail, DatasetSummary, FeatureOut, FeatureToggle
from app.services import dataset_service as svc

public_router = APIRouter(prefix="/api/datasets", tags=["datasets"])
admin_router = APIRouter(prefix="/api/admin/datasets", tags=["admin: datasets"])


# ---- user / admin -------------------------------------------------------------------------------------
@public_router.get("", response_model=list[AvailableDataset])
def list_available_datasets(user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Admins see every dataset; normal users only see datasets with a published model."""
    return publishing_service.available_datasets(db, user)


@public_router.get("/{dataset_id}/features", response_model=list[FeatureOut])
def dataset_features(dataset_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    dataset = svc.get_dataset_or_404(db, dataset_id)
    if user.role != ROLE_ADMIN and dataset.status != DatasetStatus.PUBLISHED:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Dataset not found.")
    return [f for f in dataset.features if f.enabled or user.role == ROLE_ADMIN]


# ---- admin --------------------------------------------------------------------------------------------
@admin_router.get("", response_model=list[DatasetSummary])
def admin_list_datasets(_: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.list_datasets(db)


@admin_router.post("", response_model=DatasetDetail, status_code=status.HTTP_201_CREATED)
def upload_dataset(
    file: UploadFile = File(...),
    name: str = Form(...),
    energy_type: str = Form(...),
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db),
):
    """Store the CSV, inspect its real schema, and return a suggested configuration."""
    return svc.register_upload(db, admin, file, name, energy_type)


@admin_router.get("/{dataset_id}", response_model=DatasetDetail)
def get_dataset(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.get_dataset_or_404(db, dataset_id)


@admin_router.put("/{dataset_id}", response_model=DatasetDetail)
def configure_dataset(dataset_id: int, body: DatasetConfigIn, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.apply_config(db, svc.get_dataset_or_404(db, dataset_id), body)


@admin_router.put("/{dataset_id}/features", response_model=DatasetDetail)
def set_features(dataset_id: int, body: list[FeatureToggle], _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.update_features(db, svc.get_dataset_or_404(db, dataset_id), body)


@admin_router.post("/{dataset_id}/validate", response_model=DatasetDetail)
def validate_dataset(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.run_validation(db, svc.get_dataset_or_404(db, dataset_id))


@admin_router.post("/{dataset_id}/process", response_model=DatasetDetail)
def process_dataset(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    return svc.run_processing(db, svc.get_dataset_or_404(db, dataset_id))


@admin_router.delete("/{dataset_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_dataset(dataset_id: int, _: User = Depends(require_admin), db: Session = Depends(get_db)):
    svc.delete_dataset(db, svc.get_dataset_or_404(db, dataset_id))
    return Response(status_code=status.HTTP_204_NO_CONTENT)
