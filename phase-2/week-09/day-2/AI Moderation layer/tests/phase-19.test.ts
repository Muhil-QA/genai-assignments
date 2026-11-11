import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadOutputValidationPolicy } from "../src/middleware/output-schema-validator";

const signingSecret = Buffer.from(
  "phase-19-test-secret-with-at-least-32-bytes",
);
const policy = loadOutputValidationPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.user") {
  return new SignJWT({ sub: "phase-19-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function validate(body: unknown, role = "moderation.user") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/validate/output")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

test("allows JSON output conforming to a registered schema", async () => {
  const response = await validate({
    outputType: "json",
    schemaId: "answer-sources-v1",
    output: {
      answer: "The cancellation period is 14 days.",
      sources: ["DOC-101"],
    },
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.valid, true);
  assert.equal(response.body.decision, "ALLOW");
  assert.equal(response.body.safe, true);
  assert.deepEqual(response.body.errors, []);
  assert.equal(response.body.policyVersion, policy.version);
});

test("blocks missing fields, wrong types, and unexpected properties", async () => {
  const cases = [
    { answer: "Answer without sources." },
    { answer: 42, sources: [] },
    { answer: "Answer.", sources: [], extra: true },
  ];

  for (const output of cases) {
    const response = await validate({
      outputType: "json",
      schemaId: "answer-sources-v1",
      output,
    });
    assert.equal(response.status, 200);
    assert.equal(response.body.valid, false);
    assert.equal(response.body.decision, "BLOCK");
    assert.deepEqual(response.body.errors, ["SCHEMA_VALIDATION_FAILED"]);
  }
});

test("blocks executable script content in a text-only registered schema", async () => {
  for (const script of [
    "<script>alert(1)</script>",
    "<SCRIPT>alert(1)</SCRIPT>",
  ]) {
    const response = await validate({
      outputType: "json",
      schemaId: "answer-sources-v1",
      output: { answer: `Result ${script}`, sources: [] },
    });

    assert.equal(response.body.decision, "BLOCK");
    assert.equal(response.body.errors[0], "SCHEMA_VALIDATION_FAILED");
    assert.equal(JSON.stringify(response.body).includes(script), false);
  }
});

test("blocks unknown schemas without accepting caller-defined schemas", async () => {
  const response = await validate({
    outputType: "json",
    schemaId: "caller-controlled",
    output: { anything: true },
    schema: { type: "object" },
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_REQUEST");

  const unknown = await validate({
    outputType: "json",
    schemaId: "unknown-schema",
    output: {},
  });
  assert.equal(unknown.status, 200);
  assert.equal(unknown.body.decision, "BLOCK");
  assert.deepEqual(unknown.body.errors, ["UNKNOWN_SCHEMA"]);
});

test("allows code only when forbidden patterns are absent and dependencies are allowlisted", async () => {
  const allowed = await validate({
    outputType: "code",
    code: "const result = _.uniq([1, 1, 2]);",
    dependencies: ["lodash"],
  });
  assert.equal(allowed.body.decision, "ALLOW");
  assert.equal(allowed.body.safe, true);

  const forbidden = await validate({
    outputType: "code",
    code: "const value = eval(input);",
    dependencies: ["lodash"],
  });
  assert.equal(forbidden.body.decision, "BLOCK");
  assert.deepEqual(forbidden.body.errors, ["FORBIDDEN_CODE_PATTERN"]);

  const disallowedDependency = await validate({
    outputType: "code",
    code: "export const result = 1;",
    dependencies: ["left-pad"],
  });
  assert.equal(disallowedDependency.body.decision, "BLOCK");
  assert.deepEqual(disallowedDependency.body.errors, [
    "DEPENDENCY_NOT_ALLOWED",
  ]);
});

test("blocks oversized generated code and does not echo it", async () => {
  const code = "x".repeat(policy.codeValidation.maximumCodeLength + 1);
  const response = await validate({
    outputType: "code",
    code,
    dependencies: [],
  });

  assert.equal(response.body.decision, "BLOCK");
  assert.deepEqual(response.body.errors, ["CODE_TOO_LARGE"]);
  assert.equal(JSON.stringify(response.body).includes(code), false);
});

test("rejects malformed requests and requires moderation.user", async () => {
  const malformed = await validate({
    outputType: "code",
    code: "export const answer = 42;",
    dependencies: [],
    execute: true,
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");

  const forbidden = await validate(
    {
      outputType: "json",
      schemaId: "answer-sources-v1",
      output: { answer: "ok", sources: [] },
    },
    "moderation.tester",
  );
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");
});
