import assert from "node:assert/strict";
import { join } from "node:path";
import { test } from "node:test";
import request from "supertest";
import { createApp } from "../src/app";
import { loadPolicyConfig } from "../src/config";

const readyApp = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  {
    mode: "local",
    secret: Buffer.from("phase-02-test-secret-with-at-least-32-bytes"),
  },
);
const testAuthentication = {
  mode: "local" as const,
  secret: Buffer.from("phase-02-test-secret-with-at-least-32-bytes"),
};

test("reports health without exposing internal details", async () => {
  const response = await request(readyApp).get("/health");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "UP",
    service: "genai-guardrail-gateway",
  });
  assert.ok(response.headers["x-request-id"]);
});

test("reports readiness when policy configuration is loaded", async () => {
  const response = await request(readyApp).get("/ready");

  assert.equal(response.status, 200);
  assert.deepEqual(response.body, {
    status: "READY",
    policyVersion: "1.0.0",
  });
});

test("does not report readiness when the policy configuration is missing", async () => {
  const policyPath = join(process.cwd(), "config", "missing-policy.yaml");
  const app = createApp(loadPolicyConfig(policyPath), testAuthentication);
  const response = await request(app).get("/ready");

  assert.equal(response.status, 503);
  assert.equal(response.body.status, "NOT_READY");
  assert.equal("policyVersion" in response.body, false);
});

test("returns a safe 404 for an unknown route", async () => {
  const response = await request(readyApp).get("/unknown");

  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, "NOT_FOUND");
  assert.equal(JSON.stringify(response.body).includes("stack"), false);
  assert.ok(response.headers["x-request-id"]);
});

test("uses a valid correlation ID as the request ID", async () => {
  const response = await request(readyApp)
    .get("/health")
    .set("X-Correlation-Id", "postman-test-001");

  assert.equal(response.headers["x-request-id"], "postman-test-001");
});
