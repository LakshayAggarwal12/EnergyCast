# Deployment Guide

This guide covers deploying EnergiCast to production using **Vercel (frontend)** and **Render (backend)**.

## Prerequisites

- A Render account (for backend)
- A Vercel account (for frontend)
- PostgreSQL database (can be hosted on Render)

## Backend Deployment (Render)

### 1. Prepare Backend

```bash
cd backend
cp .env.example .env
```

Edit `.env` with your production values:

```env
DATABASE_URL=postgresql://user:password@your-db-host:5432/energicast
JWT_SECRET=<generate a strong 32+ character secret>
MODEL_STORAGE_PATH=./models
CORS_ORIGINS=http://localhost:5173,https://your-frontend.vercel.app
```

Generate a secure JWT secret:
```bash
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

### 2. Deploy to Render

1. Push your code to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com/)
3. Click **New +** → **Web Service**
4. Connect your GitHub repository
5. Configure the web service:
   - **Name**: `energicast-backend` (or your preferred name)
   - **Region**: Choose closest to your users
   - **Branch**: `main`
   - **Runtime**: `Python 3`
   - **Build Command**: `pip install -r requirements.txt`
   - **Start Command**: `uvicorn app.main:app --host 0.0.0.0 --port $PORT`
6. Add environment variables (from your `.env`):
   - `DATABASE_URL`
   - `JWT_SECRET`
   - `CORS_ORIGINS` (include your Vercel frontend URL)
   - `MODEL_STORAGE_PATH` (set to `./models`)
   - `DATA_STORAGE_PATH` (set to `./data`)
7. Click **Deploy Web Service**

### 3. Setup PostgreSQL on Render

1. In Render Dashboard, click **New +** → **PostgreSQL**
2. Choose a plan (Free tier available)
3. Note the **Internal Database URL** from the dashboard
4. Update your backend service's `DATABASE_URL` environment variable with this URL

### 4. Initialize Database

After deployment, your backend will automatically create tables on startup. To create an admin user:

1. Go to your Render service dashboard
2. Click **Shell** in the top right
3. Run:
```bash
python -m app.scripts.create_admin --name "Admin" --email admin@yourdomain.com
```

**Note your backend URL**: It will be `https://your-service-name.onrender.com`

## Frontend Deployment (Vercel)

### 1. Prepare Frontend

Update `frontend/.env` (for local testing):
```env
VITE_API_URL=https://your-backend.onrender.com
```

### 2. Deploy to Vercel

1. Push your code to GitHub
2. Go to [Vercel Dashboard](https://vercel.com/dashboard)
3. Click **Add New Project**
4. Import your GitHub repository
5. Configure the project:
   - **Framework Preset**: Vite
   - **Root Directory**: `frontend`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
6. Add environment variable:
   - `VITE_API_URL`: Your Render backend URL (e.g., `https://energicast-backend.onrender.com`)
7. Click **Deploy**

### 3. Update Backend CORS

After your Vercel deployment completes:
1. Note your Vercel URL (e.g., `https://your-project.vercel.app`)
2. Go to your Render backend service
3. Update the `CORS_ORIGINS` environment variable to include your Vercel URL:
   ```
   http://localhost:5173,https://your-project.vercel.app
   ```
4. Redeploy the backend (changes will auto-deploy)

## Troubleshooting

### Frontend can't fetch API on reload

**Problem**: API calls fail on page reload or navigation.

**Solutions**:
1. Ensure `VITE_API_URL` is set in Vercel environment variables
2. Check that backend `CORS_ORIGINS` includes your Vercel domain
3. Verify backend is running and accessible at the URL
4. Check browser console for CORS errors

### CORS Errors

**Problem**: Browser shows CORS policy errors.

**Solution**:
1. Update backend `CORS_ORIGINS` to include your frontend domain
2. Ensure the URL includes the protocol (https://)
3. Redeploy backend after changes

### 401 Unauthorized

**Problem**: API returns 401 errors.

**Solution**:
1. Clear localStorage in your browser
2. Login again to get a fresh token
3. Check that JWT_SECRET is the same across deployments

### Backend crashes on startup

**Problem**: Backend service fails to start.

**Solution**:
1. Check Render logs for errors
2. Verify DATABASE_URL is correct and accessible
3. Ensure JWT_SECRET is set and >= 32 characters
4. Check that all required environment variables are set

## Verification

After deployment:

1. **Backend Health Check**:
   ```bash
   curl https://your-backend.onrender.com/api/health
   ```
   Should return: `{"status":"ok"}`

2. **Frontend API Test**:
   - Open your Vercel URL
   - Try to login/register
   - Check browser Network tab for successful API calls

3. **API Documentation**:
   - Visit `https://your-backend.onrender.com/docs`
   - Interactive API docs should be available

## Production Checklist

- [ ] Backend deployed on Render
- [ ] PostgreSQL database setup on Render
- [ ] Admin user created
- [ ] Backend CORS_ORIGINS includes Vercel domain
- [ ] Frontend deployed on Vercel
- [ ] VITE_API_URL set in Vercel environment
- [ ] Backend health check passing
- [ ] Frontend can successfully login
- [ ] API calls working on page reload
- [ ] Database tables created automatically
