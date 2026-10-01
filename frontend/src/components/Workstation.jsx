import { useState, useEffect } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAuth } from "../context/AuthContext";
import { usePrefersReducedMotion } from "../hooks/usePrefersReducedMotion";

const userTabs = [
  { to: "/dashboard",  label: "Overview",        end: true },
  { to: "/forecast",   label: "Forecast" },
  { to: "/signals",    label: "Signals" },
  { to: "/lab",        label: "Models" },
  { to: "/forecasts",  label: "History",         end: true },
];

const adminTabs = [
  { to: "/admin",          label: "Control Room", end: true },
  { to: "/admin/datasets", label: "Datasets" },
  { to: "/forecast",       label: "Forecast" },
  { to: "/lab",            label: "Models" },
  { to: "/forecasts",      label: "History",     end: true },
];

export default function Workstation({ children, pathname }) {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const reduced = usePrefersReducedMotion();
  const tabs = isAdmin ? adminTabs : userTabs;
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="workstation">
      {/* Header */}
      <header
        className="sticky top-0 z-50 transition-all duration-200"
        style={{
          background: scrolled
            ? "rgba(7, 11, 9, 0.96)"
            : "rgba(7, 11, 9, 0.88)",
          backdropFilter: "blur(8px)",
          borderBottom: `1px solid ${scrolled ? "rgba(30,44,34,0.9)" : "rgba(30,44,34,0.5)"}`,
          boxShadow: scrolled ? "0 4px 32px rgba(0,0,0,0.4)" : "none",
        }}
      >
        <div className="mx-auto flex max-w-[1320px] items-center justify-between gap-4 px-4 py-3">
          {/* Logo */}
          <NavLink
            to={isAdmin ? "/admin" : "/dashboard"}
            className="flex items-baseline gap-3 group"
          >
            <span
              className="text-[17px] font-semibold tracking-tight transition-colors"
              style={{ color: "var(--color-ink)" }}
            >
              Energi
              <span style={{ color: "var(--color-now)" }}>Cast</span>
            </span>
            <span
              className="hidden font-mono text-[9px] uppercase tracking-[0.28em] sm:inline"
              style={{ color: "var(--color-muted)" }}
            >
              Energy Time Machine
            </span>
          </NavLink>

          {/* User info */}
          {user && (
            <div className="flex items-center gap-5 font-mono text-[11px]">
              <NavLink
                to="/profile"
                className="transition-colors"
                style={{ color: "var(--color-muted)" }}
                onMouseOver={e => (e.target.style.color = "var(--color-ink)")}
                onMouseOut={e => (e.target.style.color = "var(--color-muted)")}
              >
                {user.name}
              </NavLink>
              <span
                className="border px-1.5 py-0.5 uppercase tracking-wider text-[9px]"
                style={{
                  color: isAdmin ? "var(--color-now)" : "var(--color-future)",
                  borderColor: isAdmin ? "rgba(200,168,108,0.3)" : "rgba(122,184,122,0.3)",
                  background: isAdmin ? "rgba(200,168,108,0.06)" : "rgba(122,184,122,0.06)",
                }}
              >
                {user.role}
              </span>
              <button
                type="button"
                className="transition-colors uppercase tracking-wider text-[9px]"
                style={{ color: "var(--color-muted)" }}
                onMouseOver={e => (e.target.style.color = "var(--color-bad)")}
                onMouseOut={e => (e.target.style.color = "var(--color-muted)")}
                onClick={() => { logout(); navigate("/login"); }}
              >
                Sign out
              </button>
            </div>
          )}
        </div>

        {/* Navigation tabs */}
        {user && (
          <nav
            className="mx-auto flex max-w-[1320px] gap-0 overflow-x-auto px-4"
            aria-label="Primary navigation"
          >
            {tabs.map((t) => (
              <NavLink
                key={t.to}
                to={t.to}
                end={t.end}
                className="relative flex items-center"
                style={({ isActive }) => ({
                  padding: "10px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: "10px",
                  letterSpacing: "0.18em",
                  textTransform: "uppercase",
                  color: isActive ? "var(--color-now)" : "var(--color-muted)",
                  transition: "color 0.15s",
                  whiteSpace: "nowrap",
                })}
                onMouseOver={e => {
                  if (!e.currentTarget.classList.contains("active")) {
                    e.currentTarget.style.color = "var(--color-ink)";
                  }
                }}
                onMouseOut={e => {
                  if (!e.currentTarget.classList.contains("active")) {
                    e.currentTarget.style.color = "var(--color-muted)";
                  }
                }}
              >
                {({ isActive }) => (
                  <>
                    {t.label}
                    {isActive && (
                      <span
                        className="absolute inset-x-0 bottom-0 h-0.5"
                        style={{
                          background: "var(--color-now)",
                          boxShadow: "0 0 8px var(--color-now-glow)",
                        }}
                      />
                    )}
                  </>
                )}
              </NavLink>
            ))}
          </nav>
        )}
      </header>

      {/* Page content */}
      <AnimatePresence mode="wait">
        <motion.div
          key={pathname}
          initial={reduced ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          exit={reduced ? undefined : { opacity: 0 }}
          transition={{ duration: reduced ? 0 : 0.2, ease: "easeOut" }}
          className="mx-auto max-w-[1320px] px-4 py-8"
        >
          {children}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
