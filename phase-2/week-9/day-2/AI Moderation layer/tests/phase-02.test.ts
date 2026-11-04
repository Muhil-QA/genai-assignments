import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";

const secret = Buffer.from("phase-02-test-secret-with-at-least-32-bytes");
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret },
);

function signToken(options: { expired?: boolean; issuer?: string } = {}) {
  const jwt = new SignJWT({
    sub: "postman-test-client",
    roles: ["moderation.user"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer(options.issuer ?? "genai-guardrail-gateway-local")
    .setIssuedAt();

  return jwt
    .setExpirationTime(options.expired ? "0s" : "15m")
    .sign(secret);
}

test("rejects a protected request without an Authorization header", async () => {
  const response = await request(app)
    .post("/api/v1/moderate")
    .send({ content: "Test content" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
  assert.ok(response.body.requestId);
});

test("rejects an invalid bearer token", async () => {
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", "Bearer not-a-valid-jwt")
    .send({ content: "Test content" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
});

test("rejects an expired bearer token", async () => {
  const token = await signToken({ expired: true });
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test content", applicationId: "demo-app" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
});

test("rejects a token from an unexpected issuer", async () => {
  const token = await signToken({ issuer: "unexpected-issuer" });
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test content" });

  assert.equal(response.status, 401);
  assert.equal(response.body.error, "UNAUTHENTICATED");
});

test("allows a valid token to reach the next middleware", async () => {
  const token = await signToken();
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test content", applicationId: "demo-app" });

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ALLOW");
});
