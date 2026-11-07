import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import AdminDashboardPage from "./AdminDashboardPage.jsx";
import { getAdminAccess } from "../lib/api.js";

const authState = vi.hoisted(() => ({ isAuthenticated: true, isLoading: false }));
vi.mock("../lib/auth.jsx", () => ({ useAuth: () => authState }));
vi.mock("../lib/api.js", () => ({ getAdminAccess: vi.fn() }));
vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

function renderPage() {
  return render(<MemoryRouter><AdminDashboardPage /></MemoryRouter>);
}

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    authState.isAuthenticated = true;
    authState.isLoading = false;
    getAdminAccess.mockReset();
  });

  it("shows administrator tools only after server authorization", async () => {
    getAdminAccess.mockResolvedValue({ isAdmin: true });
    renderPage();

    expect(await screen.findByRole("heading", { name: "Admin Dashboard" })).toBeInTheDocument();
    expect(await screen.findByRole("link", { name: /moderation/i })).toHaveAttribute("href", "/admin/moderation");
    expect(screen.getByRole("link", { name: /media diagnostics/i })).toHaveAttribute("href", "/admin/media-diagnostics");
    expect(screen.getByRole("link", { name: /media storage/i })).toHaveAttribute("href", "/admin/media-storage");
  });

  it("does not reveal admin tools when access is denied", async () => {
    getAdminAccess.mockRejectedValue(new Error("Administrator access required"));
    renderPage();

    expect(await screen.findByText(/administrator access required/i)).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /moderation/i })).not.toBeInTheDocument();
    await waitFor(() => expect(getAdminAccess).toHaveBeenCalledOnce());
  });
});
