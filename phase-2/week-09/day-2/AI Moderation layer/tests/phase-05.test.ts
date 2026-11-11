import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadSecretRules } from "../src/middleware/secret-detector";

const signingSecret = Buffer.from(
  "phase-05-test-secret-with-at-least-32-bytes",
);
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
  loadSecretRules(),
);

async function createToken(role: "moderation.user" | "moderation.tester") {
  return new SignJWT({ sub: "phase-05-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function sendModerationRequest(body: unknown) {
  const token = await createToken("moderation.user");
  return request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

test("validates the documented moderation request shape", async () => {
  const response = await sendModerationRequest({
    content: "Please summarize the approved product document.",
    applicationId: "demo-rag-app",
    conversationId: "conv-001",
    metadata: {
      channel: "postman",
      locale: "en-GB",
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ALLOW");
});

test("returns INVALID_REQUEST for missing content", async () => {
  const response = await sendModerationRequest({
    applicationId: "demo-rag-app",
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_REQUEST");
  assert.deepEqual(response.body.fields, ["content"]);
  assert.ok(response.body.requestId);
});

test("returns INVALID_REQUEST for numeric content", async () => {
  const response = await sendModerationRequest({
    content: 12345,
    applicationId: "demo-rag-app",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body.fields, ["content"]);
});

test("rejects empty or whitespace-only content", async () => {
  for (const content of ["", "   "]) {
    const response = await sendModerationRequest({
      content,
      applicationId: "demo-rag-app",
    });

    assert.equal(response.status, 400);
    assert.deepEqual(response.body.fields, ["content"]);
  }
});

test("enforces the configured 10,000-character content boundary", async () => {
  const valid = await sendModerationRequest({
    content: "a".repeat(10_000),
    applicationId: "demo-rag-app",
  });
  assert.equal(valid.status, 200);
  assert.equal(valid.body.decision, "WARN");

  const tooLong = await sendModerationRequest({
    content: "a".repeat(10_001),
    applicationId: "demo-rag-app",
  });
  assert.equal(tooLong.status, 400);
  assert.deepEqual(tooLong.body.fields, ["content"]);
});

test("requires an application ID in the documented format", async () => {
  const missing = await sendModerationRequest({ content: "Valid content." });
  assert.equal(missing.status, 400);
  assert.deepEqual(missing.body.fields, ["applicationId"]);

  const malformed = await sendModerationRequest({
    content: "Valid content.",
    applicationId: "../other-tenant",
  });
  assert.equal(malformed.status, 400);
  assert.deepEqual(malformed.body.fields, ["applicationId"]);
});

test("rejects unsupported metadata and unexpected nested fields", async () => {
  const response = await sendModerationRequest({
    content: "Valid content.",
    applicationId: "demo-rag-app",
    metadata: {
      channel: "postman",
      unexpected: { nested: true },
    },
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body.fields, ["metadata"]);
});

test("rejects unexpected top-level properties", async () => {
  const response = await sendModerationRequest({
    content: "Valid content.",
    applicationId: "demo-rag-app",
    role: "moderation.admin",
  });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body.fields, ["body"]);
});

test("requires application/json for protected POST endpoints", async () => {
  const token = await createToken("moderation.user");
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "text/plain")
    .send("plain text");

  assert.equal(response.status, 415);
  assert.equal(response.body.error, "UNSUPPORTED_MEDIA_TYPE");
  assert.deepEqual(response.body.fields, ["content-type"]);
});

test("returns a safe 400 for malformed JSON", async () => {
  const token = await createToken("moderation.user");
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "application/json")
    .send('{"content":');

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_REQUEST");
  assert.deepEqual(response.body.fields, ["body"]);
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
});

test("applies content schema validation to the secret diagnostic endpoint", async () => {
  const token = await createToken("moderation.tester");
  const response = await request(app)
    .post("/api/v1/detect/secrets")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "api_key = demo-secret-value", unexpected: true });

  assert.equal(response.status, 400);
  assert.deepEqual(response.body.fields, ["body"]);
  assert.equal(JSON.stringify(response.body).includes("demo-secret-value"), false);
});
