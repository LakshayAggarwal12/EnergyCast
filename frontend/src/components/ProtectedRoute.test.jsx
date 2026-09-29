import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { vi } from "vitest";
import ProtectedRoute from "./ProtectedRoute";

const mockAuth = vi.fn();
vi.mock("../context/AuthContext", () => ({ useAuth: () => mockAuth() }));

const renderAt = (path) => render(
  <MemoryRouter initialEntries={[path]}>
    <Routes>
      <Route path="/login" element={<div>login page</div>} />
      <Route path="/" element={<div>home</div>} />
      <Route element={<ProtectedRoute />}><Route path="/dashboard" element={<div>user area</div>} /></Route>
      <Route element={<ProtectedRoute role="admin" />}><Route path="/admin" element={<div>admin area</div>} /></Route>
    </Routes>
  </MemoryRouter>,
);

test("anonymous users are sent to login", () => {
  mockAuth.mockReturnValue({ user: null, loading: false });
  renderAt("/dashboard");
  expect(screen.getByText("login page")).toBeInTheDocument();
});

test("normal users cannot open admin routes", () => {
  mockAuth.mockReturnValue({ user: { role: "user" }, loading: false });
  renderAt("/admin");
  expect(screen.queryByText("admin area")).not.toBeInTheDocument();
  expect(screen.getByText("home")).toBeInTheDocument();
});

test("admins can open admin routes", () => {
  mockAuth.mockReturnValue({ user: { role: "admin" }, loading: false });
  renderAt("/admin");
  expect(screen.getByText("admin area")).toBeInTheDocument();
});
