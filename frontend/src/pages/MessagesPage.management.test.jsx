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
  editMessage,
  deleteMessage,
  markConversationRead,
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
  { address: "0xALICE", username: "alice", displayName: "Alice" },
  { address: "0xBOB", username: "bob", displayName: "Bob" },
];

const ownMessage = {
  id: "own-message",
  sender: "0xME",
  receiver: "0xBOB",
  content: "Original message",
  createdAt: new Date().toISOString(),
  readAt: null,
};

function renderMessagesPage(initialEntry = "/messages?with=0xBOB") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
      <MessagesPage />
    </MemoryRouter>,
  );
}

describe("MessagesPage message management", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      address: "0xME",
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    });
    getAuthToken.mockReturnValue("test-token");
    getAllProfiles.mockResolvedValue(profiles);
    getMessages.mockResolvedValue([
      ownMessage,
      {
        id: "alice-preview",
        sender: "0xALICE",
        receiver: "0xME",
        content: "Hello from Alice",
        createdAt: new Date(Date.now() - 60_000).toISOString(),
      },
    ]);
    getPinnedConversations.mockResolvedValue({ pinned: [] });
    getUnreadMessageCounts.mockResolvedValue({ conversations: {} });
    getConversationsTyping.mockResolvedValue({ statuses: {} });
    getConversation.mockImplementation(async (_wallet, address) => ({
      messages: address === "0xBOB" ? [ownMessage] : [],
      hasMore: false,
    }));
    editMessage.mockResolvedValue({
      ...ownMessage,
      content: "Updated message",
      editedAt: new Date().toISOString(),
    });
    deleteMessage.mockResolvedValue({
      ...ownMessage,
      content: "",
      deletedAt: new Date().toISOString(),
    });
    markConversationRead.mockResolvedValue({ messages: [] });
    syncFirebaseAuth.mockResolvedValue(false);
  });

  it("saves an edited message and updates the visible conversation", async () => {
    renderMessagesPage();

    expect(await screen.findByText("Original message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));

    const editor = screen.getByRole("textbox", { name: "Edit message" });
    fireEvent.change(editor, { target: { value: "  Updated message  " } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(editMessage).toHaveBeenCalledWith("own-message", "Updated message");
      expect(screen.getByText("Updated message")).toBeInTheDocument();
    });
    expect(screen.queryByRole("textbox", { name: "Edit message" })).not.toBeInTheDocument();
  });

  it("requires delete confirmation and shows the deleted-message state", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    renderMessagesPage();

    expect(await screen.findByText("Original message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    await waitFor(() => {
      expect(confirm).toHaveBeenCalledWith(
        "Delete this message for everyone in the conversation? This cannot be undone.",
      );
      expect(deleteMessage).toHaveBeenCalledWith("own-message");
      expect(screen.getByText("This message was deleted")).toBeInTheDocument();
    });
  });

  it("does not delete a message when the user cancels confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    renderMessagesPage();

    expect(await screen.findByText("Original message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Original message")).toBeInTheDocument();
  });

  it("marks incoming unread messages as read when their conversation is opened", async () => {
    const incoming = {
      id: "incoming-unread",
      sender: "0xBOB",
      receiver: "0xME",
      content: "Please read this",
      createdAt: new Date().toISOString(),
      readAt: null,
    };
    getConversation.mockResolvedValue({ messages: [incoming], hasMore: false });
    markConversationRead.mockResolvedValue({
      messages: [{ id: "incoming-unread", readAt: new Date().toISOString() }],
    });

    renderMessagesPage();

    expect(await screen.findByText("Please read this")).toBeInTheDocument();
    await waitFor(() => {
      expect(markConversationRead).toHaveBeenCalledWith("0xBOB");
    }, { timeout: 2000 });
  });

  it("clears the previous conversation messages when switching chats", async () => {
    const bobMessage = { ...ownMessage, id: "bob-message", content: "Only in Bob chat" };
    const aliceMessage = {
      id: "alice-message",
      sender: "0xALICE",
      receiver: "0xME",
      content: "Only in Alice chat",
      createdAt: new Date().toISOString(),
      readAt: new Date().toISOString(),
    };
    getConversation.mockImplementation(async (_wallet, address) => ({
      messages: address === "0xBOB" ? [bobMessage] : [aliceMessage],
      hasMore: false,
    }));

    renderMessagesPage("/messages");

    fireEvent.click(await screen.findByRole("button", { name: /bob/i }));
    expect(await screen.findByText("Only in Bob chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /alice/i }));

    expect(await screen.findByText("Only in Alice chat")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Only in Bob chat")).not.toBeInTheDocument();
    });
    expect(getConversation).toHaveBeenCalledWith("0xME", "0xALICE", { limit: 100 });
  });
});
