import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MessagesPage from "./MessagesPage.jsx";
import { useAuth, getAuthToken } from "../lib/auth.jsx";
import {
  getMessages,
  getUnreadMessageCounts,
  getPinnedConversations,
  getAllProfiles,
  getConversationsTyping,
  getConversation,
  sendMessage,
} from "../lib/api.js";
import { syncFirebaseAuth } from "../lib/firebase-auth.js";

vi.mock("../components/Layout.jsx", () => ({
  default: ({ children }) => <div data-testid="layout">{children}</div>,
}));

vi.mock("../lib/auth.jsx", () => ({
  useAuth: vi.fn(),
  getAuthToken: vi.fn(() => "test-token"),
}));

vi.mock("../lib/api.js", () => ({
  getMessages: vi.fn(),
  getUnreadMessageCounts: vi.fn(),
  getPinnedConversations: vi.fn(),
  setConversationPinned: vi.fn(),
  sendMessage: vi.fn(),
  editMessage: vi.fn(),
  deleteMessage: vi.fn(),
  setMessageReaction: vi.fn(),
  uploadMessageAttachment: vi.fn(),
  getAllProfiles: vi.fn(),
  getConversation: vi.fn(),
  markConversationRead: vi.fn(),
  setConversationTyping: vi.fn(),
  getConversationsTyping: vi.fn(),
  prepareRealtimeConversations: vi.fn(),
  truncateAddress: (address = "") =>
    address.length > 12 ? `${address.slice(0, 6)}…${address.slice(-4)}` : address,
}));

vi.mock("../lib/firebase.js", () => ({
  firebaseDb: {},
  convId: (a, b) => [a, b].sort().join("_"),
}));

vi.mock("../lib/firebase-auth.js", () => ({
  syncFirebaseAuth: vi.fn(),
}));

vi.mock("firebase/database", () => ({
  ref: vi.fn(() => ({})),
  onValue: vi.fn(() => vi.fn()),
  query: vi.fn(() => ({})),
  orderByChild: vi.fn(),
  limitToLast: vi.fn(),
}));

const profiles = [
  { address: "0xBOB", username: "bob", displayName: "Bob" },
];

function renderSelectedConversation() {
  return render(
    <MemoryRouter initialEntries={["/messages?with=0xBOB"]}>
      <MessagesPage />
    </MemoryRouter>,
  );
}

function getComposer() {
  return screen.getByPlaceholderText("Message...").closest("form");
}

describe("MessagesPage message sending", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      address: "0xME",
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    });
    getAuthToken.mockReturnValue("test-token");
    getAllProfiles.mockResolvedValue(profiles);
    getMessages.mockResolvedValue([]);
    getPinnedConversations.mockResolvedValue({ pinned: [] });
    getUnreadMessageCounts.mockResolvedValue({ conversations: {} });
    getConversationsTyping.mockResolvedValue({ statuses: {} });
    getConversation.mockResolvedValue({ messages: [], hasMore: false });
    sendMessage.mockResolvedValue({ id: "sent-message" });
    syncFirebaseAuth.mockResolvedValue(false);
  });

  it("sends trimmed message content to the selected conversation", async () => {
    renderSelectedConversation();

    const input = await screen.findByPlaceholderText("Message...");
    await waitFor(() => expect(getConversation).toHaveBeenCalledWith(
      "0xME",
      "0xBOB",
      { limit: 100 },
    ));

    fireEvent.change(input, { target: { value: "  Hello Bob!  " } });
    fireEvent.submit(getComposer());

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        sender: "0xME",
        receiver: "0xBOB",
        content: "Hello Bob!",
        replyToMessageId: null,
      });
    });
    await waitFor(() => expect(input).toHaveValue(""));
  });

  it("does not submit a message containing only whitespace", async () => {
    renderSelectedConversation();

    const input = await screen.findByPlaceholderText("Message...");
    const submitButton = getComposer().querySelector('button[type="submit"]');

    fireEvent.change(input, { target: { value: "   " } });

    expect(submitButton).toBeDisabled();
    fireEvent.submit(getComposer());

    expect(sendMessage).not.toHaveBeenCalled();
  });

  it("restores the draft and alerts the user when sending fails", async () => {
    const alert = vi.spyOn(window, "alert").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    sendMessage.mockRejectedValueOnce(new Error("Network unavailable"));

    renderSelectedConversation();

    const input = await screen.findByPlaceholderText("Message...");
    fireEvent.change(input, { target: { value: "Please deliver this" } });
    fireEvent.submit(getComposer());

    await waitFor(() => {
      expect(alert).toHaveBeenCalledWith("Network unavailable");
      expect(input).toHaveValue("Please deliver this");
    });
    expect(sendMessage).toHaveBeenCalledOnce();
  });
});
