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
  getPresenceBatch,
  getConversation,
  sendMessage,
  markConversationRead,
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
  getPresenceBatch: vi.fn(),
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

function renderMessagesPage(initialEntry = "/") {
  return render(
    <MemoryRouter initialEntries={[initialEntry]}>
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
    getPresenceBatch.mockResolvedValue({});
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

  it("updates an inbox preview without restarting its presence listener", async () => {
    syncFirebaseAuth.mockResolvedValue(true);
    renderMessagesPage();

    const aliceChat = await screen.findByRole("button", { name: /alice/i });
    const presenceRegistration = await waitFor(() => {
      const index = onValue.mock.calls.findIndex(([target]) =>
        target?.path === "presence/0xALICE",
      );
      expect(index).toBeGreaterThanOrEqual(0);
      return {
        unsubscribe: onValue.mock.results[index]?.value,
      };
    });
    const previewListener = await waitFor(() => {
      const listener = onValue.mock.calls.find(([target]) =>
        target?.baseRef?.path === "conversations/0xALICE_0xME/messages",
      );
      expect(listener).toBeTruthy();
      return listener;
    });

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
    expect(presenceRegistration.unsubscribe).not.toHaveBeenCalled();
  });

  it("shows online status from the server when Firebase presence is unavailable", async () => {
    syncFirebaseAuth.mockResolvedValue(false);
    getPresenceBatch.mockResolvedValue({
      "0xALICE": new Date().toISOString(),
    });

    renderMessagesPage("/messages?with=0xALICE");

    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(document.querySelector(".bg-green-500")).toBeInTheDocument();
    expect(getPresenceBatch).toHaveBeenCalledWith(
      expect.arrayContaining(["0xALICE"]),
    );
  });

  it("does not let an older database poll overwrite newer Firebase presence", async () => {
    syncFirebaseAuth.mockResolvedValue(true);
    let resolvePresenceBatch;
    getPresenceBatch.mockImplementation(() => new Promise((resolve) => {
      resolvePresenceBatch = resolve;
    }));

    renderMessagesPage("/messages?with=0xALICE");

    const firebaseListener = await waitFor(() => {
      const listener = onValue.mock.calls.find(([target]) =>
        target?.path === "presence/0xALICE",
      );
      expect(listener).toBeTruthy();
      return listener;
    });

    const freshHeartbeat = new Date(Date.now() - 20_000).toISOString();
    const staleHeartbeat = new Date(Date.now() - 3 * 60_000).toISOString();

    act(() => {
      firebaseListener[1]({ val: () => ({ lastSeenAt: freshHeartbeat }) });
    });

    await act(async () => {
      resolvePresenceBatch({ "0xALICE": staleHeartbeat });
    });

    expect(await screen.findByText("Online", { selector: "p" })).toBeInTheDocument();
    expect(document.querySelector(".bg-green-500")).toBeInTheDocument();
  });

  it("tolerates a one-minute server/device clock difference without showing a future last-seen label", async () => {
    syncFirebaseAuth.mockResolvedValue(false);
    getPresenceBatch.mockResolvedValue({
      "0xALICE": new Date(Date.now() + 60_000).toISOString(),
    });

    renderMessagesPage("/messages?with=0xALICE");

    expect(await screen.findByText("Online")).toBeInTheDocument();
    expect(screen.queryByText(/Last seen in/i)).not.toBeInTheDocument();
  });

  it("does not treat a far-future heartbeat timestamp as online", async () => {
    syncFirebaseAuth.mockResolvedValue(false);
    getPresenceBatch.mockResolvedValue({
      "0xALICE": new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    });

    renderMessagesPage("/messages?with=0xALICE");

    expect(await screen.findByText("Offline")).toBeInTheDocument();
    expect(document.querySelector(".bg-green-500")).not.toBeInTheDocument();
  });

  it("shows database history while the initial Firebase message snapshot is delayed", async () => {
    syncFirebaseAuth.mockResolvedValue(true);
    getConversation.mockResolvedValue({
      messages: [{
        id: "message-from-neon",
        sender: "0xALICE",
        receiver: "0xME",
        content: "History loaded from the database",
        createdAt: "2026-10-31T12:00:00.000Z",
      }],
      hasMore: false,
    });

    renderMessagesPage("/messages?with=0xALICE");

    expect(await screen.findByText("History loaded from the database")).toBeInTheDocument();
    expect(getConversation).toHaveBeenCalledWith("0xME", "0xALICE", { limit: 100 });
  });

  it("keeps the chat keyboard closed on entry and exposes a multiline composer", async () => {
    renderMessagesPage("/messages?with=0xALICE");

    const composer = await screen.findByPlaceholderText("Message...");
    expect(composer.tagName).toBe("TEXTAREA");
    expect(composer).toHaveAttribute("enterkeyhint", "enter");
    expect(composer).not.toHaveFocus();
  });

  it("completes a successful Android notification reply and dismisses its notification", async () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    sendMessage.mockResolvedValue({ id: "sent-from-notification" });
    markConversationRead.mockResolvedValue({});

    renderMessagesPage(
      "/messages?with=0xALICE&nativeAction=reply&nativeActionId=reply-123&nativeActionNotificationId=expo-notification-456&replyText=Hello%20Alice",
    );

    await waitFor(() => {
      expect(sendMessage).toHaveBeenCalledWith({
        sender: "0xME",
        receiver: "0xALICE",
        content: "Hello Alice",
      });
    });
    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });

    expect(markConversationRead).toHaveBeenCalledWith("0xALICE");
    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      type: "notification-action-complete",
      payload: {
        notificationId: "expo-notification-456",
        success: true,
      },
    });
    delete window.ReactNativeWebView;
  });

  it("does not report a failed Android notification reply as completed", async () => {
    const postMessage = vi.fn();
    window.ReactNativeWebView = { postMessage };
    sendMessage.mockRejectedValue(new Error("Message delivery failed"));

    renderMessagesPage(
      "/messages?with=0xALICE&nativeAction=reply&nativeActionId=reply-456&nativeActionNotificationId=expo-notification-789&replyText=Try%20again",
    );

    await waitFor(() => {
      expect(postMessage).toHaveBeenCalledOnce();
    });

    expect(JSON.parse(postMessage.mock.calls[0][0])).toEqual({
      type: "notification-action-complete",
      payload: {
        notificationId: "expo-notification-789",
        success: false,
      },
    });
    delete window.ReactNativeWebView;
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
