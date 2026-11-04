import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import ReelsPage from "./ReelsPage.jsx";
import { getReels } from "../lib/api.js";

vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div>{children}</div>,
}));

vi.mock("../components/CommentSheet.jsx", () => ({
  default: () => null,
}));

vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => ({
    address: "0xviewer",
    isAuthenticated: true,
    openAuthModal: vi.fn(),
  }),
}));

vi.mock("../lib/api.js", () => ({
  getReels: vi.fn(),
  likePost: vi.fn(),
  recordReelWatch: vi.fn().mockResolvedValue({ ok: true }),
  truncateAddress: (address) => address || "",
}));

const reel = {
  id: "reel-1",
  owner: "0xcreator",
  title: "A test Reel",
  content: "Testing video playback",
  mediaType: "video",
  mediaUrl: "https://media.example.test/reel.mp4",
  likes: 2,
  commentCount: 0,
  userLiked: false,
  profile: {
    username: "creator",
    displayName: "Creator",
    avatarUrl: null,
  },
};

class VisibleIntersectionObserver {
  constructor(callback) {
    this.callback = callback;
  }

  observe(target) {
    this.callback([{ target, isIntersecting: true, intersectionRatio: 1 }]);
  }

  disconnect() {}
}

describe("ReelsPage playback states", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    vi.stubGlobal("IntersectionObserver", VisibleIntersectionObserver);
    vi.spyOn(HTMLMediaElement.prototype, "play").mockResolvedValue();
    vi.spyOn(HTMLMediaElement.prototype, "pause").mockImplementation(() => {});
    getReels.mockResolvedValue({
      items: [reel],
      nextCursor: null,
      hasMore: false,
    });
  });

  it("keeps the video mounted beneath its loading overlay and clears it when playable", async () => {
    render(
      <MemoryRouter initialEntries={["/reels"]}>
        <ReelsPage />
      </MemoryRouter>,
    );

    const video = await screen.findByLabelText(/A test Reel/);
    expect(video.tagName).toBe("VIDEO");
    expect(await screen.findByText("Loading video…")).toBeInTheDocument();

    fireEvent.canPlay(video);

    await waitFor(() => {
      expect(screen.queryByText("Loading video…")).not.toBeInTheDocument();
    });

    fireEvent.waiting(video);
    expect(await screen.findByText("Buffering…")).toBeInTheDocument();

    fireEvent.playing(video);
    await waitFor(() => {
      expect(screen.queryByText("Buffering…")).not.toBeInTheDocument();
    });
  });

  it("offers a retry when a Reel video fails to load", async () => {
    render(
      <MemoryRouter initialEntries={["/reels"]}>
        <ReelsPage />
      </MemoryRouter>,
    );

    const firstVideo = await screen.findByLabelText(/A test Reel/);
    fireEvent.error(firstVideo);

    expect(await screen.findByText("We couldn't load this Reel")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));

    await waitFor(() => {
      expect(screen.queryByText("We couldn't load this Reel")).not.toBeInTheDocument();
    });
    expect(screen.getByText("Loading video…")).toBeInTheDocument();
    expect(screen.getByLabelText("A test Reel")).toBeInTheDocument();
  });
});
