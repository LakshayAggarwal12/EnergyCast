import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

/** UX guard only: the API enforces roles on the server for every request. */
export default function ProtectedRoute({ role }) {
  const { user, loading } = useAuth();
  const location = useLocation();
  if (loading) return <p className="p-8 text-muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location }} />;
  if (role && user.role !== role) return <Navigate to="/" replace />;
  return <Outlet />;
}
