import { Navigate, Route, Routes } from "react-router-dom";
import { useAuth } from "./context/AuthContext";
import Navbar from "./components/Navbar";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Register from "./pages/Register";
import UserDashboard from "./pages/UserDashboard";
import AdminDashboard from "./pages/AdminDashboard";
import DatasetManagement from "./pages/DatasetManagement";
import DatasetDetail from "./pages/DatasetDetail";
import ModelManagement from "./pages/ModelManagement";

function Home() {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  return <Navigate to={user.role === "admin" ? "/admin" : "/dashboard"} replace />;
}

export default function App() {
  return (
    <>
      <Navbar />
      <main>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/login" element={<Login />} />
          <Route path="/register" element={<Register />} />
          <Route element={<ProtectedRoute />}>
            <Route path="/dashboard" element={<UserDashboard />} />
          </Route>
          <Route element={<ProtectedRoute role="admin" />}>
            <Route path="/admin" element={<AdminDashboard />} />
            <Route path="/admin/datasets" element={<DatasetManagement />} />
            <Route path="/admin/datasets/:id" element={<DatasetDetail />} />
            <Route path="/admin/datasets/:id/models" element={<ModelManagement />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
