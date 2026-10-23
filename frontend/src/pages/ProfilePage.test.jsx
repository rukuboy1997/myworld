import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import ProfilePage from "./ProfilePage.jsx";
import { useAuth } from "../lib/auth.jsx";
import {
  getProfile,
  getFollowStatus,
  getBlockStatus,
  followUser,
  unfollowUser,
} from "../lib/api.js";

vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("../components/PostCard.jsx", () => ({
  default: () => null,
}));

vi.mock("../lib/auth.jsx", () => ({
  useAuth: vi.fn(),
}));

vi.mock("../lib/api.js", () => ({
  getProfile: vi.fn(),
  createProfile: vi.fn(),
  followUser: vi.fn(),
  unfollowUser: vi.fn(),
  getFollowStatus: vi.fn(),
  getBlockStatus: vi.fn(),
  blockUser: vi.fn(),
  unblockUser: vi.fn(),
  reportUser: vi.fn(),
  truncateAddress: (address = "") =>
    address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address,
}));

const profile = {
  username: "faruk",
  displayName: "Faruk Dakta",
  bio: "Building myWorld",
  followerCount: 7,
  followingCount: 2,
  posts: [],
};

function renderProfile(address = "0xTARGET") {
  return render(
    <MemoryRouter initialEntries={[`/profile/${address}`]}>
      <Routes>
        <Route path="/profile/:address" element={<ProfilePage />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("ProfilePage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      address: "0xVIEWER",
      isAuthenticated: true,
    });
    getProfile.mockResolvedValue({ ...profile });
    getFollowStatus.mockResolvedValue({ following: false });
    getBlockStatus.mockResolvedValue({
      blockedByMe: false,
      hasBlockedMe: false,
    });
    followUser.mockResolvedValue({});
    unfollowUser.mockResolvedValue({});
  });

  it("loads and displays the profile details", async () => {
    renderProfile();

    expect(await screen.findByRole("heading", { name: "Faruk Dakta" })).toBeInTheDocument();
    expect(screen.getByText("Building myWorld")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
    expect(getProfile).toHaveBeenCalledWith("0xTARGET", "0xVIEWER");
  });

  it("follows a profile and increments the follower count", async () => {
    renderProfile();

    const followButton = await screen.findByRole("button", { name: "Follow" });
    fireEvent.click(followButton);

    await waitFor(() => {
      expect(followUser).toHaveBeenCalledWith("0xTARGET");
      expect(screen.getByRole("button", { name: "Following" })).toBeInTheDocument();
      expect(screen.getByText("8")).toBeInTheDocument();
    });
  });

  it("unfollows a profile and decrements the follower count", async () => {
    getFollowStatus.mockResolvedValue({ following: true });
    renderProfile();

    const followingButton = await screen.findByRole("button", { name: "Following" });
    fireEvent.click(followingButton);

    await waitFor(() => {
      expect(unfollowUser).toHaveBeenCalledWith("0xTARGET");
      expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
      expect(screen.getByText("6")).toBeInTheDocument();
    });
  });

  it("keeps the follow state unchanged when the follow request fails", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    followUser.mockRejectedValue(new Error("Network unavailable"));
    renderProfile();

    fireEvent.click(await screen.findByRole("button", { name: "Follow" }));

    await waitFor(() => expect(consoleError).toHaveBeenCalledWith(
      "Follow toggle failed",
      expect.any(Error),
    ));
    expect(screen.getByRole("button", { name: "Follow" })).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("shows a safe fallback when profile loading fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    getProfile.mockRejectedValue(new Error("API unavailable"));

    renderProfile();

    expect(await screen.findByRole("heading", { name: "Anonymous" })).toBeInTheDocument();
    expect(screen.getByText("No bio yet.")).toBeInTheDocument();
  });

  it("does not show follow controls to signed-out visitors", async () => {
    useAuth.mockReturnValue({ address: null, isAuthenticated: false });
    renderProfile();

    expect(await screen.findByRole("heading", { name: "Faruk Dakta" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Follow" })).not.toBeInTheDocument();
    expect(getFollowStatus).not.toHaveBeenCalled();
  });
});
