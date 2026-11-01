import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { act } from "react-dom/test-utils";
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
} from "../lib/api.js";
import { syncFirebaseAuth } from "../lib/firebase-auth.js";
import { onValue } from "firebase/database";

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
  ref: vi.fn((_database, path) => ({ path })),
  onValue: vi.fn(() => vi.fn()),
  query: vi.fn((baseRef, ...constraints) => ({ baseRef, constraints })),
  orderByChild: vi.fn(),
  limitToLast: vi.fn(),
}));

const profiles = [
  { address: "0xALICE", username: "alice", displayName: "Alice" },
  { address: "0xBOB", username: "bob", displayName: "Bob" },
];

const messages = [
  {
    id: "message-alice",
    sender: "0xALICE",
    receiver: "0xME",
    content: "Latest message from Alice",
    createdAt: "2026-10-22T12:00:00.000Z",
  },
  {
    id: "message-bob",
    sender: "0xBOB",
    receiver: "0xME",
    content: "Earlier message from Bob",
    createdAt: "2026-10-20T12:00:00.000Z",
  },
];

function renderMessagesPage() {
  return render(
    <MemoryRouter>
      <MessagesPage />
    </MemoryRouter>,
  );
}

describe("MessagesPage inbox", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuth.mockReturnValue({
      address: "0xME",
      isAuthenticated: true,
      openAuthModal: vi.fn(),
    });
    getAuthToken.mockReturnValue("test-token");
    getAllProfiles.mockResolvedValue(profiles);
    getMessages.mockResolvedValue(messages);
    getPinnedConversations.mockResolvedValue({ pinned: ["0xBOB"] });
    getUnreadMessageCounts.mockResolvedValue({ conversations: {} });
    getConversationsTyping.mockResolvedValue({ statuses: {} });
    getConversation.mockResolvedValue({ messages: [], hasMore: false });
    syncFirebaseAuth.mockResolvedValue(false);
  });

  it("loads conversation previews and places pinned chats first", async () => {
    renderMessagesPage();

    const bobChat = await screen.findByRole("button", { name: /bob/i });
    const aliceChat = await screen.findByRole("button", { name: /alice/i });

    expect(getMessages).toHaveBeenCalledWith("0xME");
    expect(getAllProfiles).toHaveBeenCalledOnce();
    expect(getPinnedConversations).toHaveBeenCalledOnce();
    expect(bobChat).toHaveTextContent("Earlier message from Bob");
    expect(aliceChat).toHaveTextContent("Latest message from Alice");

    await waitFor(() => {
      const bobAppearsBeforeAlice =
        (bobChat.compareDocumentPosition(aliceChat) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
      expect(bobAppearsBeforeAlice).toBe(true);
    });
  });

  it("updates an inbox preview immediately when Firebase receives a new message", async () => {
    syncFirebaseAuth.mockResolvedValue(true);
    renderMessagesPage();

    const aliceChat = await screen.findByRole("button", { name: /alice/i });
    const previewListener = await waitFor(() => {
      const listener = onValue.mock.calls.find(([target]) =>
        target?.baseRef?.path === "conversations/0xALICE_0xME/messages",
      );
      expect(listener).toBeTruthy();
      return listener;
    });

    expect(previewListener).toBeTruthy();
    act(() => {
      previewListener[1]({
        val: () => ({
          "message-alice-new": {
            sender: "0xALICE",
            receiver: "0xME",
            content: "A brand-new incoming message",
            createdAt: "2026-10-31T12:00:00.000Z",
          },
        }),
      });
    });

    expect(aliceChat).toHaveTextContent("A brand-new incoming message");
  });

  it("filters conversation previews by chat or message text", async () => {
    renderMessagesPage();

    expect(await screen.findByRole("button", { name: /alice/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /bob/i })).toBeInTheDocument();

    fireEvent.change(screen.getByRole("searchbox", { name: "Search chats or messages" }), {
      target: { value: "earlier message" },
    });

    expect(screen.getByRole("button", { name: /bob/i })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /alice/i })).not.toBeInTheDocument();
  });
});
