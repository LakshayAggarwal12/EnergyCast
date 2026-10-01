import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const linkClass = ({ isActive }) =>
  `relative px-1 pb-0.5 text-sm font-medium tracking-wide transition-colors duration-150 ${
    isActive
      ? "text-accent after:absolute after:bottom-0 after:left-0 after:right-0 after:h-[2px] after:bg-accent after:rounded-t-full"
      : "text-muted hover:text-ink"
  }`;

export default function Navbar() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="bg-surface border-b border-line sticky top-0 z-50">
      <div className="mx-auto max-w-7xl px-6 h-14 flex items-center justify-between">

        {/* Brand */}
        <div className="flex items-center gap-10">
          <NavLink to={isAdmin ? "/admin" : "/dashboard"} className="flex items-center gap-2.5 group">
            {/* Energy bolt icon */}
            <svg className="w-5 h-5 text-accent" viewBox="0 0 24 24" fill="currentColor">
              <path d="M13 3L4 14h7l-1 7 9-11h-7l1-7z" />
            </svg>
            <span className="font-bold tracking-tight text-ink text-base">
              Energi<span className="text-accent">Cast</span>
            </span>
          </NavLink>

          {user && (
            <nav className="hidden md:flex items-center gap-6">
              {isAdmin ? (
                <>
                  <NavLink to="/admin" end className={linkClass}>Overview</NavLink>
                  <NavLink to="/admin/datasets" className={linkClass}>Datasets</NavLink>
                </>
              ) : (
                <NavLink to="/dashboard" className={linkClass}>Dashboard</NavLink>
              )}
              <NavLink to="/forecast" className={linkClass}>Forecast</NavLink>
              <NavLink to="/forecasts" end className={linkClass}>History</NavLink>
            </nav>
          )}
        </div>

        {/* Right side */}
        {user && (
          <div className="flex items-center gap-3">
            {/* System status dot */}
            <div className="hidden sm:flex items-center gap-1.5 text-xs text-muted border border-line rounded-full px-3 py-1">
              <div className="w-1.5 h-1.5 rounded-full bg-ok animate-pulse" />
              Live
            </div>

            <NavLink
              to="/profile"
              className="flex items-center gap-2 group"
              title={user.name}
            >
              <div className="w-8 h-8 rounded-full bg-accent/20 border border-accent/30 flex items-center justify-center font-bold text-accent text-sm transition-all duration-200 group-hover:bg-accent/30">
                {user.name?.charAt(0).toUpperCase()}
              </div>
              <div className="hidden sm:block text-left">
                <div className="text-xs font-medium text-ink leading-tight">{user.name}</div>
                <div className="text-[10px] text-muted leading-tight uppercase tracking-wider">
                  {isAdmin ? "Administrator" : "Analyst"}
                </div>
              </div>
            </NavLink>

            <button
              onClick={handleLogout}
              className="text-xs text-muted hover:text-bad transition-colors ml-1"
              title="Sign out"
            >
              <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
