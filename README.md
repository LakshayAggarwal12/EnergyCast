# EnergiCast - Energy Consumption Forecasting Using Time-Series Machine Learning Models

> **Project Documentation & Implementation Blueprint**  
> **Development model:** Iterative and Incremental SDLC  
> **Methodology:** Agile practices  
> **Planned duration:** 4 weeks / 4 one-week sprints  
> **Initial scope:** Historical dataset-based energy forecasting

---

## Table of Contents

1. [Project Need](#1-project-need)
2. [Project Overview](#2-project-overview)
3. [Users and Use Cases](#3-users-and-use-cases)
4. [System Design](#4-system-design)
5. [Data Flow Diagram](#5-data-flow-diagram)
6. [Technology Stack](#6-technology-stack)
7. [Project Modules](#7-project-modules)
8. [Four-Sprint Development Plan](#8-four-sprint-development-plan)
9. [Step-by-Step Implementation Plan](#9-step-by-step-implementation-plan)
10. [Machine Learning Pipeline](#10-machine-learning-pipeline)
11. [Dataset Strategy](#11-dataset-strategy)
12. [Database Design](#12-database-design)
13. [API Design](#13-api-design)
14. [Frontend Structure](#14-frontend-structure)
15. [Security and Data Integrity](#15-security-and-data-integrity)
16. [Testing Strategy](#16-testing-strategy)
17. [Deployment Plan](#17-deployment-plan)
18. [Future Scope](#18-future-scope)
19. [Final Product Definition](#19-final-product-definition)

---

# 1. Project Need

## 1.1 Problem Statement

Energy consumption varies over time because of factors such as time of day, day of week, seasonality, temperature, weather conditions, wind, rainfall, and historical consumption behavior.

Accurate forecasting can help organizations estimate future demand and support operational planning. Since energy consumption is inherently time-dependent, ordinary static prediction is not sufficient; the temporal structure of the data must be preserved.

## 1.2 Why EnergiCast Is Needed

EnergiCast will provide a centralized platform that automates the forecasting workflow:

```text
Raw Dataset
    ↓
Validation
    ↓
Cleaning
    ↓
Feature Engineering
    ↓
Train / Validation / Test Split
    ↓
Model Training
    ↓
Evaluation
    ↓
Model Publication
    ↓
Forecast Generation
    ↓
Visualization
```

## 1.3 Problems Addressed

| Problem | EnergiCast Solution |
|---|---|
| Raw datasets may contain missing or invalid values | Automated validation and cleaning |
| Time-series data should not be randomly shuffled for evaluation | Chronological splitting |
| Manual feature creation is repetitive | Automated time-series feature engineering |
| Comparing several forecasting models is cumbersome | Standardized training and evaluation |
| Forecasting usually requires technical ML knowledge | Web-based forecasting workflow |
| Dataset/model versions can be difficult to track | PostgreSQL metadata and model registry |
| Different users need different permissions | Admin/User RBAC |
| Forecast results can be difficult to interpret | Interactive visualization |

---

# 2. Project Overview

## 2.1 What We Are Building

**EnergiCast** is a role-based web application for **energy consumption forecasting using time-series and machine-learning models**.

An **Admin** uploads historical energy datasets, validates and preprocesses them, configures targets/features, trains forecasting models, evaluates them, and publishes an approved model.

A normal **User** does not upload or train arbitrary datasets. The User selects from energy types, features, and forecast options made available by the Admin and requests a forecast.

## 2.2 Core Product Workflow

```text
                    ENERGICAST
                        │
            ┌───────────┴───────────┐
            │                       │
          ADMIN                    USER
            │                       │
     Upload Dataset          Select Energy Type
            │                       │
     Validate Dataset         Select Features
            │                       │
       Clean Dataset          Select Horizon
            │                       │
     Configure Features       Request Forecast
            │                       │
       Train Models                 │
            │                       │
     Evaluate Models               │
            │                       │
      Publish Model ───────────────┘
                                    │
                              Generate Forecast
                                    │
                              Visualize Results
```

## 2.3 Version 1 Scope

### Included

- Historical CSV dataset ingestion
- Dataset validation and cleaning
- Time-series EDA support
- Feature engineering
- Chronological train/validation/test splitting
- Naive and Seasonal Naive baselines
- ARIMA/SARIMA where appropriate
- Random Forest
- XGBoost
- Model evaluation
- Model artifact persistence
- Admin/User authentication
- Role-based authorization
- Dataset/model management
- Forecast generation
- Forecast visualization
- Forecast history
- PostgreSQL persistence

### Not Included in V1

- Real-time smart-meter ingestion
- IoT streaming
- Kafka/MQTT
- Automatic continuous retraining
- Kubernetes
- Distributed training
- Deep learning as a required model
- Fully autonomous model selection

---

# 3. Users and Use Cases

## 3.1 User Roles

### Administrator

The Admin manages datasets and forecasting models.

**Capabilities:**

- Login
- Upload datasets
- Validate datasets
- Configure dataset columns
- Configure supported features
- Start model training
- View training status
- View evaluation metrics
- Compare candidate models
- Publish a model
- Manage available forecasting configurations

### User

The User consumes the forecasting functionality.

**Capabilities:**

- Register/login
- View available energy types
- Select supported features
- Select forecast horizon
- Generate forecasts
- View forecast charts
- View forecast tables
- View forecast history

The User cannot upload arbitrary datasets or train/publish models.

## 3.2 Major Use Cases

| Use Case | Actor | Description |
|---|---|---|
| Register | User | Create an account |
| Login | Admin/User | Authenticate |
| Upload Dataset | Admin | Upload historical CSV |
| Validate Dataset | Admin/System | Check dataset quality |
| Clean Dataset | System | Process invalid, missing, or duplicate records |
| Configure Dataset | Admin | Select timestamp, target, and features |
| Train Model | Admin | Train supported forecasting models |
| Evaluate Model | Admin | Calculate forecasting metrics |
| Publish Model | Admin | Make a validated model available |
| Select Forecast Configuration | User | Choose energy type, features, and horizon |
| Generate Forecast | User | Request future predictions |
| View Forecast | User | View predictions graphically and tabularly |
| View History | User | Review previous forecasts |

---

# 4. System Design

## 4.1 High-Level Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│                         FRONTEND                             │
│                   React + Vite + Tailwind                   │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────────────┐ │
│  │ Admin UI    │  │ User UI     │  │ Forecast Dashboard  │ │
│  └─────────────┘  └─────────────┘  └─────────────────────┘ │
└────────────────────────────┬─────────────────────────────────┘
                             │
                       REST / JSON
                             │
┌────────────────────────────▼─────────────────────────────────┐
│                         BACKEND                              │
│                       FastAPI + Python                       │
│                                                              │
│ ┌─────────────┐ ┌──────────────┐ ┌────────────────────────┐ │
│ │ Auth / RBAC │ │ Dataset API  │ │ Forecast / Model API   │ │
│ └─────────────┘ └──────────────┘ └────────────────────────┘ │
│                                                              │
│ ┌──────────────────────────────────────────────────────────┐ │
│ │              ML / Data Processing Layer                  │ │
│ │ Pandas → Cleaning → Features → Split → Training → Eval  │ │
│ └──────────────────────────────────────────────────────────┘ │
└───────────────┬───────────────────────────┬──────────────────┘
                │                           │
                ▼                           ▼
       ┌─────────────────┐         ┌────────────────────────┐
       │   PostgreSQL    │         │ Dataset / Model Store  │
       │ Users           │         │ CSV files              │
       │ Datasets        │         │ Model artifacts        │
       │ Features        │         │ Preprocessed data      │
       │ Models          │         └────────────────────────┘
       │ Forecasts       │
       └─────────────────┘
```

## 4.2 Layer Responsibilities

### Frontend

- Authentication UI
- Role-specific navigation
- Dataset upload
- Admin model management
- User forecasting controls
- Charts and tables
- Status/error feedback

### Backend

- API endpoints
- Authentication
- Authorization
- Dataset ingestion
- Validation
- Processing orchestration
- Model training orchestration
- Forecast inference
- Database access

### ML/Data Layer

- Cleaning
- Feature engineering
- Dataset splitting
- Model training
- Evaluation
- Model persistence
- Forecast generation

### Database

Stores:

- Users
- Roles
- Dataset metadata
- Feature configuration
- Model metadata
- Forecast requests
- Forecast results

---

# 5. Data Flow Diagram

```text
                         ┌───────────────┐
                         │     ADMIN     │
                         └───────┬───────┘
                                 │
                          Upload CSV Dataset
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Dataset Ingestion    │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Dataset Validation   │
                    │ Schema / Timestamp      │
                    │ Missing / Duplicates    │
                    │ Types / Data Sufficiency│
                    └────────────┬────────────┘
                                 │
                         Valid Dataset
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │     Data Cleaning       │
                    │ Missing values          │
                    │ Duplicates / Sorting    │
                    │ Type conversion          │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Feature Engineering   │
                    │ Calendar / Lag / Rolling│
                    │ Weather features        │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │ Chronological Split     │
                    │ Train | Validation | Test│
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │    Model Training       │
                    │ Naive / Seasonal Naive  │
                    │ ARIMA / SARIMA          │
                    │ Random Forest / XGBoost │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │      Evaluation         │
                    │ MAE / RMSE / MAPE*      │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │     Model Registry      │
                    └────────────┬────────────┘
                                 │
                          Admin Publishes
                                 │
                                 ▼
                         ┌───────────────┐
                         │ PUBLISHED     │
                         │ MODEL         │
                         └───────┬───────┘
                                 │
                         ┌───────▼───────┐
                         │     USER      │
                         └───────┬───────┘
                                 │
                    Select Energy + Features
                                 │
                                 ▼
                       Select Forecast Horizon
                                 │
                                 ▼
                       Forecast API Request
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Forecast Inference    │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │   Forecast Dashboard    │
                    │ Historical + Predicted  │
                    │ Charts + Tables         │
                    └─────────────────────────┘
```

> **Note:** MAPE should only be used when percentage error is mathematically appropriate, particularly when actual values are not zero.

---

# 6. Technology Stack

| Layer | Technology | Purpose |
|---|---|---|
| Frontend | React | UI |
| Frontend tooling | Vite | Build/development |
| Styling | Tailwind CSS | UI styling |
| Charts | Recharts or equivalent | Forecast visualization |
| API client | Axios/fetch | Backend communication |
| Backend | Python + FastAPI | REST API |
| Validation | Pydantic | API data validation |
| Data processing | Pandas + NumPy | Dataset processing |
| Forecasting | Statsmodels | ARIMA/SARIMA |
| ML | Scikit-learn | ML models/metrics |
| ML | XGBoost | Gradient boosting |
| Database | PostgreSQL | Persistent metadata |
| Model persistence | Joblib | Model artifacts |
| Testing | Pytest + frontend tests | Automated testing |

---

# 7. Project Modules

```text
EnergiCast
│
├── Authentication & RBAC
├── Dataset Management
├── Data Validation
├── Data Cleaning
├── Exploratory Data Analysis
├── Feature Engineering
├── Dataset Splitting
├── Model Training
├── Model Evaluation
├── Model Registry
├── Forecast Engine
├── Forecast History
└── Visualization
```

## 7.1 Authentication & RBAC

- Registration
- Login
- Password hashing
- Authentication token/session
- Role checking
- Protected routes

## 7.2 Dataset Management

- Upload
- Metadata
- Dataset status
- Column configuration
- Feature configuration

## 7.3 ML Pipeline

```text
Ingestion
   ↓
Validation
   ↓
Cleaning
   ↓
Feature Engineering
   ↓
Split
   ↓
Training
   ↓
Evaluation
   ↓
Persistence
```

## 7.4 Forecast Engine

The forecast engine loads a published model and performs inference using the same preprocessing and feature requirements used during training.

This avoids training/inference feature mismatch.

---

# 8. Four-Sprint Development Plan

**Sprint duration: 1 week**

## Sprint 1 - Foundation + Dataset Pipeline

### Objective

Build the application foundation and complete the raw dataset → clean dataset pipeline.

### Tasks

- Initialize repository
- Create `backend/` and `frontend/`
- Configure React/Vite/Tailwind
- Configure FastAPI
- Configure PostgreSQL
- Configure environment variables
- Create initial database schema
- Implement CSV upload
- Implement dataset validation
- Inspect Duyu datasets
- Implement data cleaning
- Store dataset metadata

### Deliverable

```text
CSV
 ↓
Upload
 ↓
Validation
 ↓
Cleaning
 ↓
Clean Dataset
```

---

## Sprint 2 - Feature Engineering + ML

### Objective

Build the forecasting engine.

### Tasks

- Time-series EDA
- Trend analysis
- Seasonality analysis
- Correlation analysis
- Calendar features
- Lag features
- Rolling features
- Chronological split
- Naive baseline
- Seasonal Naive
- ARIMA/SARIMA
- Random Forest
- XGBoost
- MAE
- RMSE
- Conditional MAPE
- Model persistence

### Deliverable

```text
Clean Dataset
 ↓
Feature Engineering
 ↓
Train / Validation / Test
 ↓
Models
 ↓
Evaluation
 ↓
Stored Model
```

---

## Sprint 3 - Application + Admin/User System

### Objective

Connect the ML engine to the application and implement role separation.

### Admin

- Login
- Dashboard
- Dataset upload
- Dataset configuration
- Training
- Model metrics
- Model publication

### User

- Registration/login
- Dashboard
- Energy selection
- Feature selection
- Forecast horizon
- Forecast request

### Backend

Implement:

- Authentication APIs
- Dataset APIs
- Model APIs
- Training APIs
- Forecast APIs
- History APIs

### Deliverable

```text
Admin
  ↓
Dataset
  ↓
Training
  ↓
Evaluation
  ↓
Publish Model
  ↓
User
  ↓
Forecast
```

---

## Sprint 4 - Dashboard + Testing + Deployment

### Objective

Turn the working system into the final product.

### Tasks

- Forecast dashboard
- Interactive charts
- Historical vs predicted values
- Forecast table
- Forecast history
- Admin analytics
- Unit tests
- API tests
- Integration tests
- RBAC testing
- Security review
- Production configuration
- Frontend deployment
- Backend deployment
- PostgreSQL deployment
- End-to-end validation

### Deliverable

A deployed, tested, presentation-ready EnergiCast system.

---

# 9. Step-by-Step Implementation Plan

## Step 1 - Repository and Project Initialization

Recommended root:

```text
EnergiCast/
├── backend/
├── frontend/
├── data/
├── docs/
├── .gitignore
├── README.md
└── .env.example
```

Do not commit secrets or production datasets unnecessarily.

## Step 2 - Backend Setup

Set up:

- Python virtual environment
- FastAPI
- Uvicorn
- Pydantic
- Pandas
- NumPy
- Scikit-learn
- Statsmodels
- XGBoost
- PostgreSQL driver/ORM
- Authentication dependencies

Keep functionality modular instead of putting the complete backend into `main.py`.

## Step 3 - Frontend Setup

Initialize:

- React
- Vite
- Tailwind CSS

Recommended structure:

```text
frontend/src/
├── components/
├── pages/
├── layouts/
├── services/
├── hooks/
├── utils/
└── routes/
```

## Step 4 - Database Setup

Create PostgreSQL database and initial entities:

```text
users
datasets
features
models
forecasts
forecast_values
```

Use foreign keys and suitable indexes.

## Step 5 - Authentication and RBAC

Implement:

```text
Register
   ↓
Password Hash
   ↓
Database
   ↓
Login
   ↓
Authentication
   ↓
Role Verification
```

Roles:

```text
ADMIN
USER
```

## Step 6 - Dataset Ingestion

Admin uploads a CSV.

Backend:

1. Receives file.
2. Validates extension/type.
3. Enforces size limits.
4. Stores it safely.
5. Reads it using Pandas.
6. Inspects columns.
7. Creates dataset metadata.

## Step 7 - Dataset Validation

Check:

- Timestamp column
- Target column
- Numeric target
- Missing values
- Duplicate timestamps
- Invalid timestamps
- Date range
- Frequency
- Number of records
- Chronological ordering
- Data sufficiency

Example:

```text
Dataset Validation
       │
       ├── Schema ✓
       ├── Timestamp ✓
       ├── Target ✓
       ├── Missing Values ⚠
       ├── Duplicates ✓
       └── Sufficient Data ✓
```

## Step 8 - Data Cleaning

Possible operations:

- Parse timestamps
- Sort chronologically
- Remove/resolve duplicates
- Convert numeric fields
- Handle missing values
- Handle invalid records
- Establish consistent frequency where required

Cleaning rules must be explicit and reproducible.

## Step 9 - Time-Series EDA

Analyze:

- Trend
- Seasonality
- Distribution
- Correlation
- Autocorrelation

Potential relationships:

```text
Temperature
Wind
Rain
Weather
Historical Energy
        ↓
Energy Consumption
```

## Step 10 - Feature Engineering

Potential features:

```text
Calendar:
hour
day
day_of_week
week
month
quarter
is_weekend

Lag:
lag_1
lag_2
lag_24
lag_48
lag_168

Rolling:
rolling_mean_24
rolling_std_24
rolling_mean_168
```

Actual windows must match dataset frequency.

### Critical Rule

No feature may contain information from the future relative to the prediction timestamp. This prevents data leakage.

## Step 11 - Train/Validation/Test Split

For time-series data:

```text
Past --------------------------------------> Future

|-------------|--------------|--------------|
|    Train    |  Validation  |     Test     |
|-------------|--------------|--------------|
```

Do not randomly shuffle observations for the primary forecasting evaluation.

An initial configuration may be:

```text
70% → Train
15% → Validation
15% → Test
```

Make the split configurable.

## Step 12 - Baseline Models

### Naive

```text
Forecast(t+1) = Actual(t)
```

### Seasonal Naive

```text
Forecast(t) = Actual(t - seasonal_period)
```

Baselines provide a reference against which ML models can be judged.

## Step 13 - Forecasting Models

Initial candidates:

### ARIMA

For appropriate univariate time-series data.

### SARIMA

For time series with suitable seasonal behavior.

### Random Forest

For supervised features such as lags, rolling statistics, calendar features, and exogenous variables.

### XGBoost

For nonlinear relationships between engineered features and energy consumption.

Not every model needs to be applied to every dataset.

## Step 14 - Model Evaluation

### MAE

```text
MAE = mean(|actual - predicted|)
```

Measures average absolute error.

### RMSE

```text
RMSE = sqrt(mean((actual - predicted)^2))
```

Penalizes larger errors more heavily.

### MAPE

```text
MAPE = mean(|actual - predicted| / |actual|) × 100
```

Use only when actual values make percentage error meaningful.

## Step 15 - Model Selection

Compare candidate models on the validation set.

Record:

```text
Model
Dataset Version
Hyperparameters
Training Date
Validation Metrics
Test Metrics
Artifact Location
Status
```

The test set must remain unseen during tuning/model selection.

## Step 16 - Model Registry

Suggested lifecycle:

```text
TRAINING
   ↓
EVALUATED
   ↓
APPROVED
   ↓
PUBLISHED
```

A failed training run must not overwrite an existing published model.

## Step 17 - Forecast Inference

When a User requests a forecast:

```text
User Configuration
       ↓
Load Published Model
       ↓
Load Required Preprocessing
       ↓
Construct Features
       ↓
Generate Prediction
       ↓
Persist Forecast
       ↓
Return Results
```

The inference pipeline must use compatible preprocessing and feature definitions from training.

## Step 18 - Frontend Integration

Connect:

```text
React
  ↓
REST API
  ↓
FastAPI
  ↓
ML / Database
```

Implement loading, success, empty, and error states.

## Step 19 - Testing

Test:

- Dataset validation
- Data cleaning
- Feature engineering
- Metrics
- API authorization
- Dataset upload
- Model training
- Forecast generation
- End-to-end Admin → User workflow

## Step 20 - Deployment and Final Validation

Before final submission:

- Deploy frontend
- Deploy backend
- Configure PostgreSQL
- Configure environment variables
- Configure CORS
- Verify authentication
- Verify Admin/User separation
- Test real dataset upload
- Train a model
- Publish model
- Generate forecast
- Verify forecast history
- Test production workflow

---

# 10. Machine Learning Pipeline

## 10.1 Complete ML Flow

```text
CSV
 ↓
Validation
 ↓
Cleaning
 ↓
EDA
 ↓
Feature Engineering
 ↓
Chronological Split
 ↓
Baseline
 ↓
ARIMA/SARIMA
 ↓
Random Forest
 ↓
XGBoost
 ↓
Validation
 ↓
Hyperparameter Tuning
 ↓
Final Test Evaluation
 ↓
Model Registry
 ↓
Publication
```

## 10.2 Model Comparison

| Category | Model | Purpose |
|---|---|---|
| Baseline | Naive | Simple reference |
| Baseline | Seasonal Naive | Seasonal reference |
| Classical | ARIMA | Univariate forecasting |
| Classical | SARIMA | Seasonal forecasting |
| ML | Random Forest | Nonlinear supervised forecasting |
| ML | XGBoost | Strong gradient-boosting candidate |
| Future | LSTM/GRU | Advanced sequence modeling |

---

# 11. Dataset Strategy

## 11.1 Initial Dataset

The initial development data comes from the **Duyu Time-Series Forecasting Benchmark Datasets**.

Current files:

```text
electricity.csv
weather.csv
temperature.csv
wind_rain.csv
```

## 11.2 Intended Usage

| File | Potential role |
|---|---|
| `electricity.csv` | Primary energy-consumption target |
| `temperature.csv` | Exogenous feature |
| `weather.csv` | Weather/context feature |
| `wind_rain.csv` | Wind/rain exogenous features |

The actual columns, timestamps, frequencies, date ranges, and relationships must be inspected before defining the final training schema.

## 11.3 Dataset Integration

If files share compatible timestamps:

```text
Electricity
     +
Temperature
     +
Weather
     +
Wind/Rain
     ↓
Time-Aligned Dataset
     ↓
Feature Engineering
```

If frequencies or timestamps differ, an explicit alignment/resampling strategy must be implemented instead of blindly joining the files.

---

# 12. Database Design

## Users

```text
users
-----
id
name
email
password_hash
role
created_at
updated_at
```

## Datasets

```text
datasets
--------
id
name
energy_type
file_path
timestamp_column
target_column
frequency
status
uploaded_by
created_at
updated_at
```

## Features

```text
features
--------
id
dataset_id
name
display_name
feature_type
enabled
created_at
```

## Models

```text
models
------
id
dataset_id
model_name
version
hyperparameters
metrics
artifact_path
status
created_at
```

## Forecasts

```text
forecasts
---------
id
user_id
dataset_id
model_id
horizon
created_at
```

## Forecast Values

```text
forecast_values
---------------
id
forecast_id
timestamp
predicted_value
actual_value
```

---

# 13. API Design

Initial API structure:

```text
/api
│
├── /auth
│   ├── POST /register
│   └── POST /login
│
├── /datasets
│   └── GET /
│
├── /admin
│   ├── POST /datasets
│   ├── GET /datasets/{id}
│   ├── PUT /datasets/{id}
│   ├── POST /models/train
│   ├── GET /models/{dataset_id}
│   └── POST /models/{id}/publish
│
├── /forecast
│   └── POST /
│
└── /forecasts
    ├── GET /
    └── GET /{id}
```

All Admin endpoints must enforce Admin authorization at the backend.

---

# 14. Frontend Structure

Recommended:

```text
frontend/
└── src/
    ├── assets/
    ├── components/
    │   ├── common/
    │   ├── charts/
    │   ├── forms/
    │   └── admin/
    ├── layouts/
    │   ├── AdminLayout.jsx
    │   └── UserLayout.jsx
    ├── pages/
    │   ├── auth/
    │   ├── admin/
    │   └── user/
    ├── services/
    │   ├── auth.js
    │   ├── datasets.js
    │   ├── models.js
    │   └── forecasts.js
    ├── hooks/
    ├── routes/
    ├── utils/
    ├── App.jsx
    └── main.jsx
```

## Admin Pages

```text
/admin/dashboard
/admin/datasets
/admin/datasets/:id
/admin/models
/admin/models/:id
```

## User Pages

```text
/dashboard
/forecast
/history
/profile
```

---

# 15. Security and Data Integrity

## Authentication

- Passwords must be hashed.
- Tokens must expire appropriately.
- Authentication state must be handled securely.

## Authorization

Frontend route protection is not sufficient.

The backend must enforce:

```text
User → /api/admin/* → DENIED
Admin → /api/admin/* → ALLOWED
```

## Dataset Security

Uploaded files must be:

- Type validated
- Size limited
- Stored safely
- Assigned server-generated names/paths
- Prevented from controlling arbitrary filesystem paths

## Secrets

Never commit:

```text
.env
database passwords
JWT secrets
API keys
production credentials
```

Provide:

```text
.env.example
```

with variable names but no real secrets.

---

# 16. Testing Strategy

## Unit Testing

Test:

- Dataset validation
- Missing-value handling
- Duplicate handling
- Feature engineering
- Train/test splitting
- Metrics
- Model utilities

## API Testing

Test:

- Registration
- Login
- Authentication
- Admin authorization
- Dataset upload
- Dataset validation
- Model training
- Forecast generation

## Integration Testing

Primary flow:

```text
Admin Login
    ↓
Upload Dataset
    ↓
Validate
    ↓
Clean
    ↓
Train
    ↓
Evaluate
    ↓
Publish Model
    ↓
User Login
    ↓
Select Configuration
    ↓
Generate Forecast
    ↓
View Result
```

## ML Validation

Ensure:

- No future leakage
- Correct chronological splitting
- Same preprocessing during training and inference
- Test data remains unseen during tuning
- Metrics are calculated consistently

---

# 17. Deployment Plan

## 17.1 Architecture

```text
                 Internet
                    │
          ┌─────────┴─────────┐
          │                   │
          ▼                   ▼
     React Frontend       FastAPI Backend
                               │
                    ┌──────────┴──────────┐
                    ▼                     ▼
               PostgreSQL          Model/File Storage
```

## 17.2 Components

### Frontend

Deploy the React/Vite application to a frontend hosting platform.

### Backend

Deploy FastAPI to Python-capable hosting.

### Database

Use managed PostgreSQL or securely deployed PostgreSQL.

### Storage

Datasets and model artifacts require persistent storage. Do not assume local application disk is persistent in every hosting environment.

## 17.3 Production Checklist

- [ ] Production database configured
- [ ] Environment variables configured
- [ ] CORS restricted
- [ ] HTTPS enabled
- [ ] Authentication tested
- [ ] Admin authorization tested
- [ ] File upload limits configured
- [ ] Model storage configured
- [ ] Frontend API URL configured
- [ ] End-to-end workflow tested

---

# 18. Future Scope

## Real-Time Data

```text
Smart Meter / IoT
       ↓
MQTT / Kafka
       ↓
Streaming Pipeline
       ↓
Forecast Engine
```

## Automated Retraining

Models could be retrained when:

- New data becomes available
- Performance degrades
- A schedule is reached

## Advanced Models

Potential future models:

- LSTM
- GRU
- Temporal Convolutional Networks
- Transformer-based time-series models
- Probabilistic forecasting

Advanced models should be introduced only when they provide measurable value over suitable baselines and existing models.

## Advanced Analytics

- Prediction intervals
- Anomaly detection
- Model drift detection
- Explainability
- Consumption alerts
- Energy demand planning
- Weather API integration

## Scalability

Future infrastructure may introduce:

- Background workers
- Redis
- Object storage
- Containerization
- Distributed training
- Kubernetes

These are intentionally outside the initial four-week implementation.

---

# 19. Final Product Definition

At the end of the four sprints, EnergiCast should provide:

```text
                    ┌─────────────────┐
                    │      ADMIN      │
                    └────────┬────────┘
                             │
                       Upload Dataset
                             │
                             ▼
                    ┌─────────────────┐
                    │    Validate     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │     Clean       │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Feature Engineer│
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Train / Validate│
                    │      / Test     │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Train Models    │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Evaluate Models │
                    └────────┬────────┘
                             │
                             ▼
                    ┌─────────────────┐
                    │ Publish Model   │
                    └────────┬────────┘
                             │
                    ┌────────▼────────┐
                    │      USER       │
                    └────────┬────────┘
                             │
                  Select Energy + Features
                             │
                             ▼
                    Select Forecast Horizon
                             │
                             ▼
                    ┌─────────────────┐
                    │ Generate Forecast│
                    └────────┬────────┘
                             │
                             ▼
                    ┌──────────────────┐
                    │ Forecast Dashboard│
                    │                  │
                    │ Historical Data  │
                    │ Predicted Data   │
                    │ Metrics          │
                    └──────────────────┘
```

## Definition of Done

- [ ] Admin and User roles work correctly.
- [ ] Admin can upload a real CSV dataset.
- [ ] Dataset validation works.
- [ ] Dataset cleaning works.
- [ ] Time-series features are generated without leakage.
- [ ] Chronological train/validation/test splitting works.
- [ ] Baseline models work.
- [ ] Multiple suitable forecasting models can be trained.
- [ ] Models can be evaluated using consistent metrics.
- [ ] Model metadata and artifacts can be persisted.
- [ ] Admin can publish a model.
- [ ] User can request a forecast.
- [ ] Forecast results are displayed visually.
- [ ] Forecast history is persisted.
- [ ] Backend authorization prevents User access to Admin functions.
- [ ] Core workflows have automated tests.
- [ ] Production deployment works.
- [ ] No secrets are committed to the repository.

## Project Success Criteria

EnergiCast should demonstrate a complete, reproducible forecasting system rather than merely producing a prediction:

> **Dataset → Data Quality → Time-Series Processing → Feature Engineering → Model Training → Evaluation → Model Management → Forecasting → Visualization**

This end-to-end pipeline is the core of EnergiCast.
