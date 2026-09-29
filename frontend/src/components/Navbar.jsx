import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }) =>
  `px-1 pb-1 text-sm border-b-2 ${isActive ? "border-accent text-ink" : "border-transparent text-muted hover:text-ink"}`;

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <header className="bg-surface border-b border-line">
      <div className="mx-auto max-w-6xl px-4 h-14 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <span className="font-semibold tracking-tight text-accent">EnergiCast</span>
          {user && (
            <nav className="flex gap-5">
              {isAdmin ? (
                <>
                  <NavLink to="/admin" end className={linkClass}>Overview</NavLink>
                  <NavLink to="/admin/datasets" className={linkClass}>Datasets</NavLink>
                </>
              ) : (
                <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              )}
            </nav>
          )}
        </div>
        {user && (
          <div className="flex items-center gap-4 text-sm">
            <span className="text-muted">{user.name} ({user.role})</span>
            <button className="text-accent hover:underline" onClick={() => { logout(); navigate("/login"); }}>Sign out</button>
          </div>
        )}
      </div>
    </header>
  );
}
