import assert from "node:assert/strict";
import { Writable } from "node:stream";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { detectSecret, loadSecretRules } from "../src/middleware/secret-detector";
import { createLogger } from "../src/utils/logger";

const secretValue = "demo-secret-value";
const signingSecret = Buffer.from(
  "phase-04-test-secret-with-at-least-32-bytes",
);
const rules = loadSecretRules();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
  rules,
);

async function createTesterToken() {
  return new SignJWT({
    sub: "postman-test-client",
    roles: ["moderation.tester"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

test("detects an API key assignment without returning its value", async () => {
  const token = await createTesterToken();
  const response = await request(app)
    .post("/api/v1/detect/secrets")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: `api_key = ${secretValue}` });

  assert.equal(response.status, 200);
  assert.equal(response.body.matched, true);
  assert.equal(response.body.category, "API_KEY");
  assert.equal(response.body.recommendedAction, "BLOCK");
  assert.equal(response.body.ruleId, "SECRET-APIKEY-001");
  assert.ok(response.body.requestId);
  assert.equal(JSON.stringify(response.body).includes(secretValue), false);
});

test("does not block ordinary prose containing the word key", async () => {
  const token = await createTesterToken();
  const response = await request(app)
    .post("/api/v1/detect/secrets")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "The key is on the table." });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    requestId: response.body.requestId,
    matched: false,
    category: null,
    recommendedAction: "ALLOW",
    ruleId: null,
  });
});

test("detects known token prefixes and private-key markers", () => {
  const providerToken = detectSecret(`credential ghp_${"a".repeat(36)}`, rules);
  assert.equal(providerToken.matched, true);
  assert.equal(providerToken.ruleId, "SECRET-GITHUB-001");

  const privateKey = detectSecret(
    "-----BEGIN PRIVATE KEY-----\nredacted",
    rules,
  );
  assert.equal(privateKey.matched, true);
  assert.equal(privateKey.category, "PRIVATE_KEY");
  assert.equal(privateKey.ruleId, "SECRET-PRIVATEKEY-001");
});

test("keeps the diagnostic endpoint restricted to tester role", async () => {
  const userToken = await new SignJWT({
    sub: "postman-user",
    roles: ["moderation.user"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
  const response = await request(app)
    .post("/api/v1/detect/secrets")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ content: `api_key = ${secretValue}` });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
  assert.equal(JSON.stringify(response.body).includes(secretValue), false);
});

test("redacts sensitive fields before structured logs are written", () => {
  let output = "";
  const destination = new Writable({
    write(chunk, _encoding, callback) {
      output += chunk.toString();
      callback();
    },
  });
  const logger = createLogger(destination);

  logger.info({
    content: `api_key = ${secretValue}`,
    authorization: `Bearer ${secretValue}`,
    api_key: secretValue,
    event: "test",
  });

  assert.equal(output.includes(secretValue), false);
  assert.equal(output.includes("[REDACTED]"), true);
});

test("rejects a missing content field without echoing request data", async () => {
  const token = await createTesterToken();
  const response = await request(app)
    .post("/api/v1/detect/secrets")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: null, extra: secretValue });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_REQUEST");
  assert.deepEqual(response.body.fields, ["body", "content"]);
  assert.equal(JSON.stringify(response.body).includes(secretValue), false);
});
