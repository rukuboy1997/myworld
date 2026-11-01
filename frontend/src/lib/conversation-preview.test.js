import { describe, expect, it } from "vitest";
import { upsertConversationPreview } from "./conversation-preview.js";

describe("upsertConversationPreview", () => {
  it("adds a new latest message and keeps messages in chronological order", () => {
    const conversations = [{
      address: "0xALICE",
      messages: [{
        id: "old",
        content: "Older message",
        createdAt: "2026-10-20T12:00:00.000Z",
      }],
    }];
    const updated = upsertConversationPreview(conversations, "0xALICE", {
      id: "new",
      content: "Newest message",
      createdAt: "2026-10-21T12:00:00.000Z",
    });

    expect(updated[0].messages.map((message) => message.id)).toEqual(["old", "new"]);
    expect(conversations[0].messages).toHaveLength(1);
  });

  it("updates an existing message when the latest preview changes", () => {
    const conversations = [{
      address: "0xALICE",
      messages: [{
        id: "latest",
        content: "Original text",
        createdAt: "2026-10-21T12:00:00.000Z",
      }],
    }];
    const updated = upsertConversationPreview(conversations, "0xALICE", {
      id: "latest",
      content: "Edited text",
      createdAt: "2026-10-21T12:00:00.000Z",
    });

    expect(updated[0].messages[0].content).toBe("Edited text");
    expect(conversations[0].messages[0].content).toBe("Original text");
  });

  it("returns the same state when a snapshot contains no new information", () => {
    const conversations = [{
      address: "0xALICE",
      messages: [{
        id: "latest",
        content: "Same text",
        createdAt: "2026-10-21T12:00:00.000Z",
      }],
    }];
    expect(upsertConversationPreview(conversations, "0xALICE", {
      id: "latest",
      content: "Same text",
      createdAt: "2026-10-21T12:00:00.000Z",
    })).toBe(conversations);
  });

  it("adds a previously unknown conversation to the inbox state", () => {
    const updated = upsertConversationPreview([], "0xBOB", {
      id: "first",
      content: "Hello",
      createdAt: "2026-10-21T12:00:00.000Z",
    });
    expect(updated).toEqual([{
      address: "0xBOB",
      messages: [{
        id: "first",
        content: "Hello",
        createdAt: "2026-10-21T12:00:00.000Z",
      }],
    }]);
  });
});
