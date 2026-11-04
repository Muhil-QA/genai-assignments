import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { detectPii, loadPiiRules } from "../src/middleware/pii-detector";
import { loadResourceLimits } from "../src/middleware/resource-limits";
import { loadSecretRules } from "../src/middleware/secret-detector";

const signingSecret = Buffer.from(
  "phase-08-test-secret-with-at-least-32-bytes",
);
const piiRules = loadPiiRules();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
  loadSecretRules(),
  loadResourceLimits(),
  piiRules,
);

async function createToken(role = "moderation.tester") {
  return new SignJWT({ sub: "phase-08-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function detect(content: string) {
  const token = await createToken();
  return request(app)
    .post("/api/v1/detect/pii")
    .set("Authorization", `Bearer ${token}`)
    .send({ content });
}

test("masks a valid email address without echoing the original value", async () => {
  const response = await detect("Email me at user@example.com");

  assert.equal(response.status, 200);
  assert.equal(response.body.matched, true);
  assert.equal(response.body.category, "EMAIL_ADDRESS");
  assert.deepEqual(response.body.categories, ["EMAIL_ADDRESS"]);
  assert.equal(response.body.recommendedAction, "MASK");
  assert.equal(
    response.body.sanitizedContent,
    "Email me at <EMAIL_ADDRESS_MASKED>",
  );
  assert.equal(JSON.stringify(response.body).includes("user@example.com"), false);
});

test("does not flag an invalid email-like string", async () => {
  const response = await detect("Contact user@localhost for help.");

  assert.equal(response.status, 200);
  assert.equal(response.body.matched, false);
  assert.equal(response.body.recommendedAction, "ALLOW");
  assert.equal(
    response.body.sanitizedContent,
    "Contact user@localhost for help.",
  );
});

test("masks multiple email and phone values in one request", async () => {
  const content =
    "Email user@example.com or backup@example.org; call +91 9876543210 or 9123456789.";
  const response = await detect(content);

  assert.equal(response.status, 200);
  assert.equal(response.body.matched, true);
  assert.deepEqual(response.body.categories, [
    "EMAIL_ADDRESS",
    "PHONE_NUMBER",
  ]);
  assert.equal(response.body.recommendedAction, "MASK");
  assert.equal(
    response.body.sanitizedContent,
    "Email <EMAIL_ADDRESS_MASKED> or <EMAIL_ADDRESS_MASKED>; call <PHONE_NUMBER_MASKED> or <PHONE_NUMBER_MASKED>.",
  );
  for (const rawValue of [
    "user@example.com",
    "backup@example.org",
    "+91 9876543210",
    "9123456789",
  ]) {
    assert.equal(JSON.stringify(response.body).includes(rawValue), false);
  }
});

test("blocks a Luhn-valid payment card and masks the value", async () => {
  const card = "4111 1111 1111 1111";
  const result = detectPii(`Card ${card}`, piiRules);

  assert.equal(result.matched, true);
  assert.equal(result.category, "PAYMENT_CARD");
  assert.equal(result.recommendedAction, "BLOCK");
  assert.equal(result.sanitizedContent, "Card <PAYMENT_CARD_MASKED>");
  assert.equal(JSON.stringify(result).includes(card), false);
});

test("ignores payment-card-shaped numbers with an invalid checksum", async () => {
  const result = detectPii("Card 4111 1111 1111 1112", piiRules);

  assert.equal(result.matched, false);
  assert.equal(result.recommendedAction, "ALLOW");
});

test("detects India PAN identifiers using the configured block policy", () => {
  const result = detectPii("PAN ABCDE1234F", piiRules);

  assert.equal(result.matched, true);
  assert.equal(result.category, "GOVERNMENT_ID");
  assert.equal(result.recommendedAction, "BLOCK");
  assert.equal(result.sanitizedContent, "PAN <GOVERNMENT_ID_MASKED>");
  assert.equal(result.sanitizedContent.includes("ABCDE1234F"), false);
});

test("requires valid Aadhaar Verhoeff checksum before identifying an ID", () => {
  const invalid = detectPii("ID 234567890123", piiRules);
  assert.equal(invalid.matched, false);

  let validAadhaar: string | undefined;
  for (let suffix = 0; suffix <= 9; suffix += 1) {
    const candidate = `23456789012${suffix}`;
    if (detectPii(candidate, piiRules).matched) {
      validAadhaar = candidate;
      break;
    }
  }

  assert.ok(validAadhaar);
  const valid = detectPii(`ID ${validAadhaar}`, piiRules);
  assert.equal(valid.category, "GOVERNMENT_ID");
  assert.equal(valid.recommendedAction, "BLOCK");
  assert.equal(valid.sanitizedContent, "ID <GOVERNMENT_ID_MASKED>");
});

test("aggregates actions so a block finding takes precedence over masking", async () => {
  const response = await detect(
    "Email user@example.com; card 4111111111111111",
  );

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.categories, [
    "EMAIL_ADDRESS",
    "PAYMENT_CARD",
  ]);
  assert.equal(response.body.recommendedAction, "BLOCK");
  assert.equal(
    response.body.sanitizedContent,
    "Email <EMAIL_ADDRESS_MASKED>; card <PAYMENT_CARD_MASKED>",
  );
});

test("rejects PII diagnostics for clients without the tester role", async () => {
  const token = await createToken("moderation.user");
  const response = await request(app)
    .post("/api/v1/detect/pii")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "user@example.com" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
  assert.equal(JSON.stringify(response.body).includes("user@example.com"), false);
});
