import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import SettingsPage from "./SettingsPage.jsx";

const authState = vi.hoisted(() => ({
  address: "0xSETTINGS",
  isAuthenticated: true,
  openAuthModal: vi.fn(),
}));

vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => authState,
}));

vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("../components/EmailPreferencesPanel.jsx", () => ({
  default: () => <div data-testid="email-preferences-panel">Email preferences controls</div>,
}));

function renderPage() {
  return render(
    <MemoryRouter initialEntries={["/settings"]}>
      <SettingsPage />
    </MemoryRouter>,
  );
}

describe("SettingsPage", () => {
  beforeEach(() => {
    authState.address = "0xSETTINGS";
    authState.isAuthenticated = true;
    authState.openAuthModal.mockClear();
  });

  it("organizes email, privacy, legal, and support settings in one page", () => {
    renderPage();

    expect(screen.getByRole("heading", { name: "Settings & Privacy" })).toBeInTheDocument();
    expect(screen.getByTestId("email-preferences-panel")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /terms of use/i })).toHaveAttribute("href", "/terms");
    expect(screen.getAllByRole("link", { name: /privacy policy/i })).toHaveLength(2);
    expect(screen.getAllByRole("link", { name: /privacy policy/i }).every((link) => link.getAttribute("href") === "/privacy-policy")).toBe(true);
    expect(screen.getByRole("link", { name: /safety & child protection/i })).toHaveAttribute("href", "/child-safety");
    expect(screen.getByRole("link", { name: /delete account/i })).toHaveAttribute("href", "/delete-account");
    expect(screen.getByRole("link", { name: /contact@dakta\.name\.ng/i })).toHaveAttribute("href", "mailto:contact@dakta.name.ng");
    expect(screen.getByRole("link", { name: /profile details/i })).toHaveAttribute("href", "/profile/0xSETTINGS");
  });

  it("asks signed-out visitors to sign in before showing private preferences", () => {
    authState.isAuthenticated = false;
    renderPage();

    expect(screen.queryByTestId("email-preferences-panel")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Sign in" }));
    expect(authState.openAuthModal).toHaveBeenCalledWith("signin");
  });
});
