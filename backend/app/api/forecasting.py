from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session

from app.auth.deps import get_current_user
from app.database.models import User
from app.database.session import get_db
from app.schemas.forecast import ForecastDetail, ForecastRequest, ForecastSummary
from app.services import dataset_service, forecast_service, publishing_service

router = APIRouter(prefix="/api", tags=["forecasting"])


@router.get("/datasets/{dataset_id}/forecast-info")
def forecast_info(dataset_id: int, _: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Published model, allowed horizon, model inputs and backtest window for the forecast form."""
    dataset = dataset_service.get_dataset_or_404(db, dataset_id)
    return publishing_service.forecast_info(db, dataset)


@router.post("/forecast", response_model=ForecastDetail, status_code=status.HTTP_201_CREATED)
def create_forecast(body: ForecastRequest, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    """Generate and store a forecast with the dataset's published model."""
    return forecast_service.create_forecast(db, user, body)


@router.get("/forecasts", response_model=list[ForecastSummary])
def list_forecasts(
    limit: int = Query(50, ge=1, le=200), offset: int = Query(0, ge=0),
    user: User = Depends(get_current_user), db: Session = Depends(get_db),
):
    """Your forecast history (administrators see everyone's)."""
    return forecast_service.list_forecasts(db, user, limit, offset)


@router.get("/forecasts/{forecast_id}", response_model=ForecastDetail)
def get_forecast(forecast_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)):
    return forecast_service.get_forecast(db, user, forecast_id)
