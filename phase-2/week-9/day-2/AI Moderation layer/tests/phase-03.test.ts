import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";

const secret = Buffer.from("phase-03-test-secret-with-at-least-32-bytes");
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret },
);

async function createToken(roles?: string[]) {
  const claims: { sub: string; roles?: string[] } = {
    sub: "postman-test-client",
  };
  if (roles) {
    claims.roles = roles;
  }

  return new SignJWT(claims)
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(secret);
}

test("allows moderation.user to reach the production moderation endpoint", async () => {
  const token = await createToken(["moderation.user"]);
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test content", applicationId: "demo-app" });

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ALLOW");
});

test("returns 403 when an authenticated principal has the wrong role", async () => {
  const token = await createToken(["moderation.tester"]);
  const response = await request(app)
    .post("/api/v1/moderate")
    .set("Authorization", `Bearer ${token}`)
    .send({ content: "Test content", applicationId: "demo-app" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
  assert.ok(response.body.requestId);
});

test("does not grant access based on a role in the body or a role header", async () => {
  const token = await createToken(["moderation.user"]);
  const response = await request(app)
    .get("/api/v1/admin/policy")
    .set("Authorization", `Bearer ${token}`)
    .set("X-Role", "moderation.admin")
    .send({ roles: ["moderation.admin"], role: "moderation.admin" });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
});

test("does not grant any role when the verified token has no roles claim", async () => {
  const token = await createToken();
  const response = await request(app)
    .get("/api/v1/admin/policy")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
});

test("allows moderation.admin to view the policy version", async () => {
  const token = await createToken(["moderation.admin"]);
  const response = await request(app)
    .get("/api/v1/admin/policy")
    .set("Authorization", `Bearer ${token}`);

  assert.equal(response.status, 200);
  assert.equal(response.body.policyVersion, "1.0.0");
  assert.ok(response.body.requestId);
});

test("restricts diagnostic detector routes to moderation.tester", async () => {
  const userToken = await createToken(["moderation.user"]);
  const forbidden = await request(app)
    .post("/api/v1/detect/pii")
    .set("Authorization", `Bearer ${userToken}`)
    .send({ content: "Test content" });

  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const testerToken = await createToken(["moderation.tester"]);
  const allowed = await request(app)
    .post("/api/v1/detect/pii")
    .set("Authorization", `Bearer ${testerToken}`)
    .send({ content: "Test content" });

  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.matched, false);
  assert.equal(allowed.body.recommendedAction, "ALLOW");
});

test("restricts escalation review routes to moderation.reviewer", async () => {
  const userToken = await createToken(["moderation.user"]);
  const forbidden = await request(app)
    .get("/api/v1/reviews/escalations")
    .set("Authorization", `Bearer ${userToken}`);

  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");

  const reviewerToken = await createToken(["moderation.reviewer"]);
  const allowed = await request(app)
    .get("/api/v1/reviews/escalations")
    .set("Authorization", `Bearer ${reviewerToken}`);

  assert.equal(allowed.status, 200);
  assert.deepEqual(allowed.body.reviews, []);
});
