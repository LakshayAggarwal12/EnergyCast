import { Navigate, Outlet, Route, Routes, useLocation } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import ProtectedRoute from "./components/ProtectedRoute";
import Workstation from "./components/Workstation";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/UserDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import DatasetManagement from "./pages/DatasetManagement";
import DatasetDetail from "./pages/DatasetDetail";
import ModelManagement from "./pages/ModelManagement";
import Forecast from "./pages/Forecast";
import ForecastResult from "./pages/ForecastResult";
import ForecastHistory from "./pages/ForecastHistory";
import Profile from "./pages/Profile";
import EnergySignals from "./pages/EnergySignals";
import ModelLabPage from "./pages/ModelLabPage";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return <p className="p-8 text-muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

function Shell() {
  const { pathname } = useLocation();
  return (
    <Workstation pathname={pathname}>
      <Outlet />
    </Workstation>
  );
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route element={<ProtectedRoute />}>
        <Route element={<Shell />}>
          <Route path="/dashboard" element={<UserDashboard />} />
          <Route path="/forecast" element={<Forecast />} />
          <Route path="/forecasts" element={<ForecastHistory />} />
          <Route path="/forecasts/:id" element={<ForecastResult />} />
          <Route path="/profile" element={<Profile />} />
          <Route path="/signals" element={<EnergySignals />} />
          <Route path="/lab" element={<ModelLabPage />} />
        </Route>
      </Route>
      <Route element={<ProtectedRoute role="admin" />}>
        <Route element={<Shell />}>
          <Route path="/admin" element={<AdminDashboard />} />
          <Route path="/admin/datasets" element={<DatasetManagement />} />
          <Route path="/admin/datasets/:id" element={<DatasetDetail />} />
          <Route path="/admin/datasets/:id/models" element={<ModelManagement />} />
        </Route>
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}
