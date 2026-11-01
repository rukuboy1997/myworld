import test from "node:test";
import assert from "node:assert/strict";
import { deliverExpoPush } from "../services/expo-push.service.js";

function createLogger() {
  return { warn() {} };
}

test("does not push report notifications", async () => {
  let queryCalls = 0;
  const result = await deliverExpoPush(
    { recipient: "0xrecipient", type: "report" },
    {
      query: async () => { queryCalls += 1; return { rows: [] }; },
      getProfile: async () => null,
      fetchImpl: async () => { throw new Error("should not be called"); },
      logger: createLogger(),
    },
  );
  assert.deepEqual(result, { skipped: true, reason: "report_notification" });
  assert.equal(queryCalls, 0);
});

test("sends a message push with the expected conversation deep link", async () => {
  const requests = [];
  const result = await deliverExpoPush(
    {
      recipient: "0xrecipient",
      type: "message",
      actorAddress: "0xsender",
      excerpt: "Hello there",
    },
    {
      query: async () => ({ rows: [{ token: "ExponentPushToken[abc]" }] }),
      getProfile: async () => ({
        displayName: "Sender",
        username: "sender",
        avatarUrl: "https://cdn.example.com/avatar.png",
      }),
      fetchImpl: async (url, options) => {
        requests.push({ url, body: JSON.parse(options.body) });
        return {
          ok: true,
          json: async () => ({ data: [{ status: "ok", id: "ticket-1" }] }),
        };
      },
      logger: createLogger(),
    },
  );

  assert.deepEqual(result, { sent: 1, failed: 0, total: 1 });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].url, "https://exp.host/--/api/v2/push/send");
  assert.equal(requests[0].body[0].title, "Sender");
  assert.equal(requests[0].body[0].body, "Hello there");
  assert.equal(requests[0].body[0].data.path, "/messages?with=0xsender");
  assert.equal(requests[0].body[0].categoryId, "myworldmessage");
  assert.equal(
    requests[0].body[0].richContent.image,
    "https://cdn.example.com/avatar.png",
  );
});

test("removes DeviceNotRegistered tokens from the recipient's token records", async () => {
  const queries = [];
  const result = await deliverExpoPush(
    {
      recipient: "0xrecipient",
      type: "follow",
      actorAddress: "0xfollower",
    },
    {
      query: async (sql, params) => {
        queries.push({ sql, params });
        if (sql.startsWith("SELECT")) {
          return { rows: [{ token: "ExponentPushToken[dead]" }] };
        }
        return { rows: [], rowCount: 1 };
      },
      getProfile: async () => ({ username: "Follower" }),
      fetchImpl: async () => ({
        ok: true,
        json: async () => ({
          data: [{
            status: "error",
            message: "The recipient is no longer registered",
            details: { error: "DeviceNotRegistered" },
          }],
        }),
      }),
      logger: createLogger(),
    },
  );

  assert.deepEqual(result, { sent: 0, failed: 1, total: 1 });
  assert.equal(queries.length, 2);
  assert.match(queries[1].sql, /DELETE FROM push_tokens/);
  assert.deepEqual(queries[1].params, ["0xrecipient", ["ExponentPushToken[dead]"]]);
});

test("keeps push provider failures from throwing into the social action", async () => {
  const result = await deliverExpoPush(
    {
      recipient: "0xrecipient",
      type: "like",
      actorAddress: "0xactor",
      postId: "post-1",
    },
    {
      query: async () => ({ rows: [{ token: "ExponentPushToken[abc]" }] }),
      getProfile: async () => null,
      fetchImpl: async () => { throw new Error("Expo offline"); },
      logger: createLogger(),
    },
  );

  assert.deepEqual(result, { sent: 0, failed: 1, total: 1 });
});

test("returns safely when there are no registered push tokens", async () => {
  const result = await deliverExpoPush(
    { recipient: "0xrecipient", type: "like", actorAddress: "0xactor" },
    {
      query: async () => ({ rows: [] }),
      getProfile: async () => null,
      fetchImpl: async () => { throw new Error("should not be called"); },
      logger: createLogger(),
    },
  );
  assert.deepEqual(result, {
    sent: 0,
    skipped: true,
    reason: "no_registered_devices",
  });
});
