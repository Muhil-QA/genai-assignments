import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  detectConfidential,
  loadConfidentialPolicy,
} from "../src/middleware/confidential-detector";
import { loadPiiRules } from "../src/middleware/pii-detector";
import { loadResourceLimits } from "../src/middleware/resource-limits";
import { loadSecretRules } from "../src/middleware/secret-detector";

const signingSecret = Buffer.from(
  "phase-09-test-secret-with-at-least-32-bytes",
);
const policy = loadConfidentialPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
  loadSecretRules(),
  loadResourceLimits(),
  loadPiiRules(),
  policy,
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-09-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string, role?: string) {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/detect/confidential")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("allows unmarked public content without returning the content", async () => {
  const result = detectConfidential(
    "This public product description can be shared.",
    policy,
  );

  assert.deepEqual(result, {
    matched: false,
    classification: "PUBLIC",
    recommendedAction: "ALLOW",
    ruleId: "CONF-PUBLIC-001",
  });
  assert.equal(JSON.stringify(result).includes("product description"), false);
});

test("recognizes explicit classification tags with configured actions", () => {
  assert.deepEqual(detectConfidential("[PUBLIC] sample", policy), {
    matched: true,
    classification: "PUBLIC",
    recommendedAction: "ALLOW",
    ruleId: "CONF-PUBLIC-001",
  });
  assert.deepEqual(detectConfidential("[INTERNAL] sample", policy), {
    matched: true,
    classification: "INTERNAL",
    recommendedAction: "WARN",
    ruleId: "CONF-INTERNAL-001",
  });
  assert.deepEqual(detectConfidential("[CONFIDENTIAL] sample", policy), {
    matched: true,
    classification: "CONFIDENTIAL",
    recommendedAction: "BLOCK",
    ruleId: "CONF-CONFIDENTIAL-001",
  });
  assert.deepEqual(detectConfidential("[RESTRICTED] sample", policy), {
    matched: true,
    classification: "RESTRICTED",
    recommendedAction: "BLOCK",
    ruleId: "CONF-RESTRICTED-001",
  });
});

test("recognizes explicit classification header lines case-insensitively", () => {
  const result = detectConfidential(
    "Classification: Restricted\nSensitive material",
    policy,
  );

  assert.equal(result.classification, "RESTRICTED");
  assert.equal(result.recommendedAction, "BLOCK");
});

test("uses the most restrictive marker when content has multiple labels", () => {
  const result = detectConfidential(
    "[PUBLIC]\n[INTERNAL]\n[RESTRICTED]\nSensitive text",
    policy,
  );

  assert.equal(result.classification, "RESTRICTED");
  assert.equal(result.recommendedAction, "BLOCK");
  assert.equal(result.ruleId, "CONF-RESTRICTED-001");
});

test("does not interpret ordinary mentions as classification markers", () => {
  const result = detectConfidential(
    "This content is not classified as restricted.",
    policy,
  );

  assert.equal(result.matched, false);
  assert.equal(result.classification, "PUBLIC");
  assert.equal(result.recommendedAction, "ALLOW");
});

test("returns only classification metadata and never echoes confidential text", async () => {
  const privateText = "Project-Orchid acquisition discussion";
  const response = await detect(
    `[RESTRICTED]\n${privateText}`,
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.matched, true);
  assert.equal(response.body.classification, "RESTRICTED");
  assert.equal(response.body.recommendedAction, "BLOCK");
  assert.equal(response.body.ruleId, "CONF-RESTRICTED-001");
  assert.equal(JSON.stringify(response.body).includes(privateText), false);
  assert.equal(JSON.stringify(response.body).includes("[RESTRICTED]"), false);
});

test("keeps the confidential diagnostic endpoint tester-only", async () => {
  const response = await detect("[CONFIDENTIAL] secret business text", "moderation.user");

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
  assert.equal(
    JSON.stringify(response.body).includes("secret business text"),
    false,
  );
});
