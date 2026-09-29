# EnergiCast

Role-based energy consumption forecasting (React + Vite + Tailwind, FastAPI, PostgreSQL, Pandas/Statsmodels/scikit-learn/XGBoost).
This repository is **phase 1**: foundation, dataset ingestion, preprocessing and initial model training.
The product specification is `EnergiCast_Final_Product_Documentation_v2.pdf`.

## Run the backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt

createdb energicast                       # or any PostgreSQL database you own
cp .env.example .env                      # then edit DATABASE_URL and JWT_SECRET
python -m app.scripts.create_admin --name "Admin" --email admin@yourdomain.dev   # prompts for a password
uvicorn app.main:app --reload --port 8000  # tables are created on startup; API docs at /docs
```

## Run the frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173  (proxies /api to http://127.0.0.1:8000)
```

## Tests

```bash
cd backend
createdb energicast_test                  # tests refuse to run on a database whose name lacks "test"
export TEST_DATABASE_URL=postgresql://user:password@localhost:5432/energicast_test
export ENERGICAST_HOUSEHOLD_CSV=/path/to/household_power_consumption.csv   # pipeline tests use the real files
export ENERGICAST_ELECTRICITY_CSV=/path/to/Electricity.csv
pytest -q

cd ../frontend && npm test
```

## Workflow (Admin)

1. `POST /api/admin/datasets` – upload CSV; the real schema is inspected and a configuration is suggested.
2. `PUT  /api/admin/datasets/{id}` – confirm timestamp/target/exogenous columns (optionally format, frequency, horizon).
3. `POST /api/admin/datasets/{id}/validate` – validation report (errors reject the dataset).
4. `POST /api/admin/datasets/{id}/process` – clean, resample, save processed data.
5. `POST /api/admin/models/train` – queue training; poll `GET /api/admin/training-runs/{run_id}`.
6. `GET  /api/admin/models/{dataset_id}` – model comparison (MAE / RMSE / MAPE, validation and test).
