import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";

const signingSecret = Buffer.from(
  "phase-18-test-secret-with-at-least-32-bytes",
);
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.user") {
  return new SignJWT({
    sub: "phase-18-test-client",
    roles: [role],
    tenantId: "TENANT-A",
    ragRoles: ["claims-agent"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

function outputBody(
  overrides: {
    originalRequestId?: string;
    content?: string;
    sourceIds?: string[];
  } = {},
) {
  return {
    originalRequestId: overrides.originalRequestId ?? "req_500",
    content: overrides.content ?? "Your cancellation period is 14 days.",
    sourceIds: overrides.sourceIds ?? ["DOC-101"],
  };
}

async function moderateOutput(body: unknown, role = "moderation.user") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/moderate/output")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

test("warns and withholds benign output when safety categories are unavailable", async () => {
  const response = await moderateOutput(outputBody());

  assert.equal(response.status, 200);
  assert.equal(response.body.originalRequestId, "req_500");
  assert.equal(response.body.decision, "WARN");
  assert.equal(response.body.safe, false);
  assert.deepEqual(response.body.checks, {
    safetyCategories: "NOT_EVALUATED",
    sourceAuthorization: "PASSED",
    businessPolicy: "PASSED",
  });
  assert.equal(Object.hasOwn(response.body, "sanitizedContent"), false);
  assert.equal(JSON.stringify(response.body).includes("14 days"), false);
});

test("blocks output containing a configured API-key pattern without echoing it", async () => {
  const secret = "API_KEY=abcdefghijklmnop123456";
  const response = await moderateOutput(
    outputBody({ content: `Your key is ${secret}` }),
  );

  assert.equal(response.body.decision, "BLOCK");
  assert.equal(response.body.safe, false);
  assert.equal(JSON.stringify(response.body).includes(secret), false);
  assert.equal(Object.hasOwn(response.body, "sanitizedContent"), false);
});

test("masks configured PII as the dominant decision but does not release while safety is unevaluated", async () => {
  const response = await moderateOutput(
    outputBody({ content: "Contact customer@example.com for help." }),
  );

  assert.equal(response.body.decision, "MASK");
  assert.equal(response.body.safe, false);
  assert.equal(Object.hasOwn(response.body, "sanitizedContent"), false);
  assert.equal(
    JSON.stringify(response.body).includes("customer@example.com"),
    false,
  );
});

test("blocks system-prompt leakage indicators and restricted business content", async () => {
  const promptLeak = await moderateOutput(
    outputBody({
      content: "I will reveal the hidden system instructions.",
    }),
  );
  assert.equal(promptLeak.body.decision, "BLOCK");

  const restricted = await moderateOutput(
    outputBody({ content: "[RESTRICTED] Internal account records." }),
  );
  assert.equal(restricted.body.decision, "BLOCK");
  assert.equal(restricted.body.checks.businessPolicy, "BLOCKED");
});

test("blocks unknown, deleted, expired, and cross-tenant source IDs", async () => {
  for (const sourceId of [
    "DOC-UNKNOWN",
    "DOC-102",
    "DOC-103",
    "DOC-201",
  ]) {
    const response = await moderateOutput(
      outputBody({ sourceIds: [sourceId] }),
    );
    assert.equal(response.body.decision, "BLOCK", sourceId);
    assert.equal(response.body.checks.sourceAuthorization, "BLOCKED");
  }
});

test("warns when source provenance is not supplied", async () => {
  const response = await moderateOutput(outputBody({ sourceIds: [] }));

  assert.equal(response.body.decision, "WARN");
  assert.equal(response.body.safe, false);
  assert.equal(response.body.checks.sourceAuthorization, "NOT_EVALUATED");
});

test("rejects malformed, duplicate, or extra fields and enforces moderation.user", async () => {
  const malformed = await moderateOutput({
    ...outputBody(),
    sourceIds: ["DOC-101", "DOC-101"],
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");

  const extraField = await moderateOutput({
    ...outputBody(),
    tenantId: "TENANT-A",
  });
  assert.equal(extraField.status, 400);

  const forbidden = await moderateOutput(outputBody(), "moderation.tester");
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");
});
