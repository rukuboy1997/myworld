import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import MessagesPage from "./MessagesPage.jsx";
import { useAuth, getAuthToken } from "../lib/auth.jsx";
import {
  getMessages,
  getUnreadMessageCounts,
  getPinnedConversations,
  getMutedConversations,
  getArchivedConversations,
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
  getMutedConversations: vi.fn(),
  setConversationMuted: vi.fn(),
  getArchivedConversations: vi.fn(),
  setConversationArchived: vi.fn(),
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
    getMutedConversations.mockResolvedValue({ muted: [] });
    getArchivedConversations.mockResolvedValue({ archived: [] });
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

  it("dismisses New Chat search on outside taps and Escape, while the plus button toggles it", async () => {
    renderMessagesPage("/messages");
    const plus = screen.getByTitle("New conversation");

    fireEvent.click(plus);
    expect(await screen.findByPlaceholderText("Search people…")).toBeInTheDocument();

    fireEvent.pointerDown(screen.getByRole("heading", { name: "Chats" }));
    expect(screen.queryByPlaceholderText("Search people…")).not.toBeInTheDocument();

    fireEvent.click(plus);
    expect(await screen.findByPlaceholderText("Search people…")).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByRole("searchbox", { name: "Search chats or messages" }));
    expect(screen.queryByPlaceholderText("Search people…")).not.toBeInTheDocument();

    fireEvent.click(plus);
    expect(await screen.findByPlaceholderText("Search people…")).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByPlaceholderText("Search people…")).not.toBeInTheDocument();

    fireEvent.click(plus);
    expect(await screen.findByPlaceholderText("Search people…")).toBeInTheDocument();
    fireEvent.click(plus);
    expect(screen.queryByPlaceholderText("Search people…")).not.toBeInTheDocument();
  });

  it("keeps New Chat search open while typing and opens the selected user's conversation", async () => {
    renderMessagesPage("/messages");
    fireEvent.click(screen.getByTitle("New conversation"));

    const search = await screen.findByPlaceholderText("Search people…");
    fireEvent.change(search, { target: { value: "alice" } });
    expect(search).toHaveValue("alice");

    fireEvent.click(await screen.findByRole("button", { name: "alice", exact: true }));
    await waitFor(() => {
      expect(getConversation).toHaveBeenCalledWith("0xME", "0xALICE", { limit: 100 });
    });
    expect(screen.queryByPlaceholderText("Search people…")).not.toBeInTheDocument();
  });

  it("mutes and unmutes only the selected conversation", async () => {
    const { setConversationMuted } = await import("../lib/api.js");
    renderMessagesPage();

    fireEvent.click(await screen.findByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Mute conversation" }));
    await waitFor(() => expect(setConversationMuted).toHaveBeenCalledWith("0xBOB", true));

    fireEvent.click(screen.getByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Unmute conversation" }));
    await waitFor(() => expect(setConversationMuted).toHaveBeenLastCalledWith("0xBOB", false));
  });

  it("archives and restores a conversation without deleting its messages", async () => {
    const { setConversationArchived } = await import("../lib/api.js");
    let bobIsArchived = false;
    getArchivedConversations.mockImplementation(async () => ({
      archived: bobIsArchived ? ["0xBOB"] : [],
    }));
    setConversationArchived.mockImplementation(async (_address, archived) => {
      bobIsArchived = archived;
      return { ok: true, otherAddress: "0xBOB", isArchived: archived };
    });
    renderMessagesPage();

    fireEvent.click(await screen.findByRole("button", { name: "Conversation options" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Archive conversation" }));
    await waitFor(() => {
      expect(setConversationArchived).toHaveBeenCalledWith("0xBOB", true);
      expect(screen.queryByRole("button", { name: "Conversation options" })).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Archived" }));
    const archivedBob = await screen.findByRole("button", { name: "Open conversation with bob" });
    fireEvent.click(archivedBob);
    fireEvent.click(await screen.findByRole("button", { name: "Options for bob" }));
    fireEvent.click(screen.getByRole("menuitem", { name: "Restore conversation" }));

    await waitFor(() => {
      expect(setConversationArchived).toHaveBeenNthCalledWith(2, "0xBOB", false);
      expect(screen.getByRole("button", { name: "Options for bob" })).toBeInTheDocument();
    });
  });

  it("closes the conversation options menu with Escape and restores focus", async () => {
    renderMessagesPage();
    const trigger = await screen.findByRole("button", { name: "Conversation options" });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Conversation actions" })).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("menu", { name: "Conversation actions" })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it("closes the conversation options menu when the user taps outside it", async () => {
    renderMessagesPage();
    const trigger = await screen.findByRole("button", { name: "Conversation options" });

    fireEvent.click(trigger);
    expect(screen.getByRole("menu", { name: "Conversation actions" })).toBeInTheDocument();

    fireEvent.pointerDown(document.body);

    expect(screen.queryByRole("menu", { name: "Conversation actions" })).not.toBeInTheDocument();
  });

  it("offers inbox quick actions without opening the conversation", async () => {
    const { setConversationPinned } = await import("../lib/api.js");
    renderMessagesPage("/messages");

    const options = await screen.findByRole("button", { name: "Options for alice" });
    fireEvent.click(options);
    fireEvent.click(screen.getByRole("menuitem", { name: "Pin conversation" }));

    await waitFor(() => {
      expect(setConversationPinned).toHaveBeenCalledWith("0xALICE", true);
    });
    expect(getConversation).not.toHaveBeenCalledWith("0xME", "0xALICE", { limit: 100 });
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

  it("requires in-app confirmation and shows the deleted-message state", async () => {
    renderMessagesPage();

    expect(await screen.findByText("Original message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));

    const dialog = await screen.findByRole("alertdialog", { name: "Delete message?" });
    expect(dialog).toHaveTextContent(
      "Delete this message for everyone in the conversation? This cannot be undone.",
    );
    expect(deleteMessage).not.toHaveBeenCalled();

    fireEvent.click(within(dialog).getByRole("button", { name: "Delete", exact: true }));
    await waitFor(() => {
      expect(deleteMessage).toHaveBeenCalledWith("own-message");
      expect(screen.getByText("This message was deleted")).toBeInTheDocument();
    });
  });

  it("does not delete a message when the user cancels in-app confirmation", async () => {
    renderMessagesPage();

    expect(await screen.findByText("Original message")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    expect(await screen.findByRole("alertdialog", { name: "Delete message?" })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));

    expect(deleteMessage).not.toHaveBeenCalled();
    expect(screen.getByText("Original message")).toBeInTheDocument();
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument();
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

    fireEvent.click(await screen.findByRole("button", { name: "Open conversation with bob" }));
    expect(await screen.findByText("Only in Bob chat")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Open conversation with alice" }));

    expect(await screen.findByText("Only in Alice chat")).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.queryByText("Only in Bob chat")).not.toBeInTheDocument();
    });
    expect(getConversation).toHaveBeenCalledWith("0xME", "0xALICE", { limit: 100 });
  });
});
