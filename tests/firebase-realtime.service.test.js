import test from "node:test";
import assert from "node:assert/strict";
import { createSign, createVerify, generateKeyPairSync } from "node:crypto";
import { createFirebaseCustomToken } from "../services/firebase-realtime.service.js";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});
const previousCredentials = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
const testAccount = {
  type: "service_account",
  project_id: "fascoin-app",
  private_key_id: "firebase-realtime-test-key",
  private_key: privateKey,
  client_email: "firebase-adminsdk-test@fascoin-app.iam.gserviceaccount.com",
};
process.env.FIREBASE_SERVICE_ACCOUNT_JSON = JSON.stringify(testAccount);

test("custom Firebase tokens are signed and bound to the authenticated myWorld user", () => {
  const token = createFirebaseCustomToken({
    address: "0x1234567890abcdef",
    username: "test_user",
  });
  const [encodedHeader, encodedPayload, encodedSignature] = token.split(".");
  assert.ok(encodedHeader && encodedPayload && encodedSignature);

  const header = JSON.parse(Buffer.from(encodedHeader, "base64url").toString("utf8"));
  const payload = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));
  assert.equal(header.alg, "RS256");
  assert.equal(header.kid, testAccount.private_key_id);
  assert.equal(payload.iss, testAccount.client_email);
  assert.equal(payload.sub, testAccount.client_email);
  assert.equal(
    payload.aud,
    "https://identitytoolkit.googleapis.com/google.identity.identitytoolkit.v1.IdentityToolkit",
  );
  assert.equal(payload.uid, "0x1234567890abcdef");
  assert.deepEqual(payload.claims, {
    address: "0x1234567890abcdef",
    username: "test_user",
  });

  const verifier = createVerify("RSA-SHA256");
  verifier.update(`${encodedHeader}.${encodedPayload}`);
  verifier.end();
  assert.equal(
    verifier.verify(publicKey, Buffer.from(encodedSignature, "base64url")),
    true,
  );
});

test.after(() => {
  if (previousCredentials === undefined) {
    delete process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  } else {
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON = previousCredentials;
  }
});
