import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { subDays } from "date-fns";
import NotificationsPage from "./NotificationsPage.jsx";
import {
  getNotifications,
  markNotificationRead,
  markNotificationsRead,
} from "../lib/api.js";

vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({ isAuthenticated: true, openAuthModal: vi.fn() }),
}));

vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/EmailPreferencesPanel.jsx", () => ({
  default: () => <div data-testid="email-preferences" />,
}));

vi.mock("../lib/api.js", () => ({
  getNotifications: vi.fn(),
  markNotificationRead: vi.fn(),
  markNotificationsRead: vi.fn(),
  truncateAddress: (address) => address ? `${address.slice(0, 6)}...${address.slice(-4)}` : "",
}));

const now = new Date();
const yesterday = subDays(now, 1);

const sampleNotifications = [
  {
    id: "like-1",
    type: "like",
    actorAddress: "alice-address",
    actorProfile: { username: "alice", avatarUrl: null },
    postId: "post-1",
    createdAt: new Date(now.getTime() - 60_000).toISOString(),
    readAt: null,
  },
  {
    id: "like-2",
    type: "like",
    actorAddress: "bob-address",
    actorProfile: { username: "bob", avatarUrl: null },
    postId: "post-1",
    createdAt: new Date(now.getTime() - 30_000).toISOString(),
    readAt: null,
  },
  {
    id: "follow-1",
    type: "follow",
    actorAddress: "carol-address",
    actorProfile: { username: "carol", avatarUrl: null },
    postId: null,
    createdAt: yesterday.toISOString(),
    readAt: new Date(yesterday.getTime() + 60_000).toISOString(),
  },
];

function renderPage() {
  return render(
    <MemoryRouter>
      <NotificationsPage />
    </MemoryRouter>,
  );
}

describe("NotificationsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getNotifications.mockResolvedValue(sampleNotifications.map((item) => ({ ...item })));
    markNotificationRead.mockResolvedValue({ ok: true, updated: true });
    markNotificationsRead.mockResolvedValue({ ok: true });
  });

  it("groups likes for the same post and separates notifications by date", async () => {
    renderPage();

    expect(await screen.findByText(/liked your post/i)).toBeInTheDocument();
    expect(screen.getByText(/2 activities/i)).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Today" })).toBeInTheDocument();
    expect(screen.getByRole("region", { name: "Yesterday" })).toBeInTheDocument();
    expect(screen.getAllByRole("link")).toHaveLength(2);
    expect(screen.getByTestId("email-preferences")).toBeInTheDocument();
  });

  it("does not mark notifications as read merely because the page was opened", async () => {
    renderPage();

    await screen.findByText(/liked your post/i);
    expect(markNotificationsRead).not.toHaveBeenCalled();
    expect(markNotificationRead).not.toHaveBeenCalled();
    expect(screen.getByText("2 unread updates")).toBeInTheDocument();
  });

  it("marks every notification in a grouped item as read when opened", async () => {
    renderPage();

    const groupedText = await screen.findByText(/liked your post/i);
    fireEvent.click(groupedText.closest("a"));

    await waitFor(() => {
      expect(markNotificationRead).toHaveBeenCalledTimes(2);
      expect(markNotificationRead).toHaveBeenCalledWith("like-1");
      expect(markNotificationRead).toHaveBeenCalledWith("like-2");
    });
  });

  it("supports the unread filter and mark-all-as-read action", async () => {
    renderPage();

    await screen.findByText(/liked your post/i);
    fireEvent.click(screen.getByRole("button", { name: /unread/i }));

    expect(screen.getByText(/liked your post/i)).toBeInTheDocument();
    expect(screen.queryByText(/started following you/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /mark all as read/i }));
    await waitFor(() => expect(markNotificationsRead).toHaveBeenCalledTimes(1));
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });

  it("shows a retry action when notification loading fails", async () => {
    getNotifications.mockRejectedValueOnce(new Error("Temporary failure"));
    renderPage();

    expect(await screen.findByText(/couldn't load your notifications/i)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /try again/i }));

    expect(await screen.findByText(/liked your post/i)).toBeInTheDocument();
    expect(getNotifications).toHaveBeenCalledTimes(2);
  });
});
