import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import CommentSheet from "./CommentSheet.jsx";
import { addComment, getComments, likeComment } from "../lib/api.js";
import { uploadCommentMediaDirectly } from "../lib/mediaUpload.js";

const authMock = vi.hoisted(() => ({
  isAuthenticated: true,
  openAuthModal: vi.fn(),
}));

vi.mock("../lib/auth.jsx", () => ({
  useAuth: () => authMock,
}));

vi.mock("../lib/api.js", () => ({
  addComment: vi.fn(),
  getComments: vi.fn(),
  likeComment: vi.fn(),
  truncateAddress: (address) => address || "unknown",
}));

vi.mock("../lib/mediaUpload.js", () => ({
  uploadCommentMediaDirectly: vi.fn(),
}));

const rootComment = {
  id: "comment-root",
  postId: "post-1",
  owner: "0xcreator",
  content: "Original comment",
  parentCommentId: null,
  mediaUrl: null,
  mediaType: null,
  likeCount: 0,
  userLiked: false,
  createdAt: "2026-11-04T10:00:00.000Z",
  profile: { username: "creator", avatarUrl: null },
};

const replyComment = {
  id: "comment-reply",
  postId: "post-1",
  owner: "0xreply",
  content: "A reply",
  parentCommentId: "comment-root",
  mediaUrl: null,
  mediaType: null,
  likeCount: 0,
  userLiked: false,
  createdAt: "2026-11-04T10:01:00.000Z",
  profile: { username: "replier", avatarUrl: null },
};

const post = { id: "post-1", owner: "0xcreator", commentCount: 1 };

function renderSheet(props = {}) {
  return render(
    <MemoryRouter>
      <CommentSheet
        post={post}
        isOpen
        onClose={vi.fn()}
        onCommentAdded={vi.fn()}
        {...props}
      />
    </MemoryRouter>,
  );
}

describe("CommentSheet threaded comments and media", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.clearAllMocks();
    authMock.isAuthenticated = true;
    authMock.openAuthModal.mockClear();
    getComments.mockResolvedValue([rootComment]);
    addComment.mockResolvedValue({
      id: "comment-new",
      postId: "post-1",
      owner: "0xviewer",
      content: "New comment",
      parentCommentId: null,
      likeCount: 0,
      userLiked: false,
      createdAt: new Date().toISOString(),
      profile: { username: "viewer", avatarUrl: null },
    });
    likeComment.mockResolvedValue({ liked: true, likeCount: 1 });
    uploadCommentMediaDirectly.mockResolvedValue({ intentId: "media-intent-1" });
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: vi.fn(() => "blob:comment-preview"),
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: vi.fn(),
    });
  });

  it("loads replies under their parent and sends a reply to the root comment", async () => {
    getComments.mockResolvedValue([rootComment, replyComment]);
    addComment.mockResolvedValue({
      ...replyComment,
      id: "comment-reply-new",
      content: "My reply",
    });
    renderSheet();

    expect(await screen.findByText("Original comment")).toBeInTheDocument();
    expect(screen.queryByText("A reply")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "View 1 reply" }));
    expect(await screen.findByText("A reply")).toBeInTheDocument();

    fireEvent.click(screen.getAllByRole("button", { name: "Reply" })[0]);
    const input = screen.getByLabelText("Write a comment");
    fireEvent.change(input, { target: { value: "My reply" } });
    fireEvent.click(screen.getByRole("button", { name: "Post reply" }));

    await waitFor(() => {
      expect(addComment).toHaveBeenCalledWith("post-1", "My reply", {
        parentCommentId: "comment-root",
        mediaIntentId: undefined,
      });
    });
    expect(await screen.findByText("My reply")).toBeInTheDocument();
  });

  it("likes a comment and updates its like count", async () => {
    renderSheet();
    await screen.findByText("Original comment");

    const likeButton = screen.getByRole("button", { name: "Like comment" });
    fireEvent.click(likeButton);

    await waitFor(() => {
      expect(likeComment).toHaveBeenCalledWith("comment-root");
      expect(screen.getByRole("button", { name: "Unlike comment" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Unlike comment" })).toHaveTextContent("1");
    });
  });

  it("uploads a selected image to R2 before creating the comment", async () => {
    renderSheet();
    await screen.findByText("Original comment");

    const image = new File(["image-bytes"], "photo.png", { type: "image/png" });
    fireEvent.change(screen.getByLabelText("Attach image, audio, or video"), {
      target: { files: [image] },
    });
    expect(await screen.findByText("photo.png")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Write a comment"), {
      target: { value: "See this photo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      expect(uploadCommentMediaDirectly).toHaveBeenCalledWith(image, expect.any(Function));
      expect(addComment).toHaveBeenCalledWith("post-1", "See this photo", {
        parentCommentId: undefined,
        mediaIntentId: "media-intent-1",
      });
    });
  });

  it("supports a media-only audio comment", async () => {
    renderSheet();
    await screen.findByText("Original comment");

    const audio = new File(["audio-bytes"], "recording.ogg", { type: "audio/ogg" });
    fireEvent.change(screen.getByLabelText("Attach image, audio, or video"), {
      target: { files: [audio] },
    });
    expect(await screen.findByText("recording.ogg")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      expect(uploadCommentMediaDirectly).toHaveBeenCalledWith(audio, expect.any(Function));
      expect(addComment).toHaveBeenCalledWith("post-1", "", {
        parentCommentId: undefined,
        mediaIntentId: "media-intent-1",
      });
    });
  });

  it("uploads a selected video as a comment attachment", async () => {
    renderSheet();
    await screen.findByText("Original comment");

    const video = new File(["video-bytes"], "clip.mp4", { type: "video/mp4" });
    fireEvent.change(screen.getByLabelText("Attach image, audio, or video"), {
      target: { files: [video] },
    });
    expect(await screen.findByText("clip.mp4")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      expect(uploadCommentMediaDirectly).toHaveBeenCalledWith(video, expect.any(Function));
      expect(addComment).toHaveBeenCalledWith("post-1", "", {
        parentCommentId: undefined,
        mediaIntentId: "media-intent-1",
      });
    });
  });

  it("records and uploads a voice note through the comment composer", async () => {
    const stopTrack = vi.fn();
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: vi.fn().mockResolvedValue({ getTracks: () => [{ stop: stopTrack }] }) },
    });

    class MockMediaRecorder {
      static isTypeSupported(type) {
        return type === "audio/webm;codecs=opus";
      }

      constructor(_stream, options) {
        this.mimeType = options?.mimeType || "audio/webm";
        this.state = "inactive";
      }

      start() {
        this.state = "recording";
      }

      stop() {
        this.state = "inactive";
        this.ondataavailable?.({
          data: new Blob(["voice-note"], { type: this.mimeType }),
        });
        this.onstop?.();
      }
    }
    vi.stubGlobal("MediaRecorder", MockMediaRecorder);

    renderSheet();
    await screen.findByText("Original comment");
    fireEvent.click(screen.getByRole("button", { name: "Record voice note" }));
    await screen.findByRole("button", { name: "Stop voice note recording" });
    fireEvent.click(screen.getByRole("button", { name: "Stop voice note recording" }));

    expect(await screen.findByText("Voice note")).toBeInTheDocument();
    expect(stopTrack).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Post comment" }));

    await waitFor(() => {
      expect(uploadCommentMediaDirectly).toHaveBeenCalledWith(
        expect.objectContaining({ name: "voice-note.webm", type: "audio/webm;codecs=opus" }),
        expect.any(Function),
      );
      expect(addComment).toHaveBeenCalledWith("post-1", "", {
        parentCommentId: undefined,
        mediaIntentId: "media-intent-1",
      });
    });
  });

  it("asks signed-out viewers to sign in before liking or replying", async () => {
    authMock.isAuthenticated = false;
    renderSheet();
    await screen.findByText("Original comment");

    fireEvent.click(screen.getByRole("button", { name: "Like comment" }));
    fireEvent.click(screen.getByRole("button", { name: "Reply" }));

    expect(authMock.openAuthModal).toHaveBeenCalledWith("signin");
    expect(likeComment).not.toHaveBeenCalled();
    expect(addComment).not.toHaveBeenCalled();
  });
});
