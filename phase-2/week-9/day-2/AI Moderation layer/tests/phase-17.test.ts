import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import {
  DecisionPolicy,
  evaluateDecision,
  loadDecisionPolicy,
} from "../src/middleware/decision-engine";

const signingSecret = Buffer.from(
  "phase-17-test-secret-with-at-least-32-bytes",
);
const policy = loadDecisionPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.user") {
  return new SignJWT({ sub: "phase-17-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function decide(findings: unknown, role = "moderation.user") {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/decision")
    .set("Authorization", `Bearer ${token}`)
    .send({ findings });
}

test("combines each documented action-priority combination", async () => {
  const cases: Array<{
    findings: Array<{ control: string; recommendedAction: string }>;
    expected: string;
  }> = [
    {
      findings: [
        { control: "PII", recommendedAction: "MASK" },
        { control: "INJECTION", recommendedAction: "BLOCK" },
      ],
      expected: "BLOCK",
    },
    {
      findings: [
        { control: "REVIEW", recommendedAction: "ESCALATE" },
        { control: "CONTENT", recommendedAction: "WARN" },
      ],
      expected: "ESCALATE",
    },
    {
      findings: [
        { control: "POLICY", recommendedAction: "SAFE_RESPONSE" },
        { control: "PII", recommendedAction: "MASK" },
      ],
      expected: "SAFE_RESPONSE",
    },
    {
      findings: [
        { control: "PII", recommendedAction: "MASK" },
        { control: "CONTENT", recommendedAction: "WARN" },
      ],
      expected: "MASK",
    },
    {
      findings: [
        { control: "CONTENT", recommendedAction: "WARN" },
        { control: "TOKENS", recommendedAction: "ALLOW" },
      ],
      expected: "WARN",
    },
    {
      findings: [{ control: "TOKENS", recommendedAction: "ALLOW" }],
      expected: "ALLOW",
    },
  ];

  for (const { findings, expected } of cases) {
    const response = await decide(findings);
    assert.equal(response.status, 200);
    assert.equal(response.body.decision, expected);
    assert.equal(response.body.policyVersion, policy.version);
  }
});

test("returns the same decision when finding order changes", async () => {
  const findings = [
    { control: "PII", recommendedAction: "MASK" },
    { control: "CONTENT", recommendedAction: "WARN" },
    { control: "INJECTION", recommendedAction: "BLOCK" },
  ];
  const forward = await decide(findings);
  const reverse = await decide([...findings].reverse());

  assert.equal(forward.body.decision, "BLOCK");
  assert.equal(reverse.body.decision, forward.body.decision);
});

test("uses ALLOW when the findings list is empty", async () => {
  const response = await decide([]);

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ALLOW");
});

test("loads a complete versioned priority order and honors policy overrides", () => {
  assert.equal(policy.version, "1.0.0");
  assert.deepEqual(policy.priority, [
    "BLOCK",
    "ESCALATE",
    "SAFE_RESPONSE",
    "MASK",
    "WARN",
    "ALLOW",
  ]);

  const overridden: DecisionPolicy = {
    version: "2.0.0",
    priority: [
      "WARN",
      "BLOCK",
      "ESCALATE",
      "SAFE_RESPONSE",
      "MASK",
      "ALLOW",
    ],
  };
  assert.equal(
    evaluateDecision(
      {
        findings: [
          { control: "PII", recommendedAction: "MASK" },
          { control: "CONTENT", recommendedAction: "WARN" },
        ],
      },
      overridden,
    ),
    "WARN",
  );
});

test("rejects malformed, unsupported, or oversized findings", async () => {
  const unknownAction = await decide([
    { control: "PII", recommendedAction: "IGNORE" },
  ]);
  assert.equal(unknownAction.status, 400);
  assert.equal(unknownAction.body.error, "INVALID_REQUEST");

  const extraFindingField = await decide([
    {
      control: "PII",
      recommendedAction: "MASK",
      severity: "HIGH",
    },
  ]);
  assert.equal(extraFindingField.status, 400);

  const extraTopLevelField = await request(app)
    .post("/api/v1/decision")
    .set("Authorization", `Bearer ${await createToken()}`)
    .send({ findings: [], policyVersion: "forged" });
  assert.equal(extraTopLevelField.status, 400);

  const tooManyFindings = await decide(
    Array.from({ length: 101 }, () => ({
      control: "TOKENS",
      recommendedAction: "ALLOW",
    })),
  );
  assert.equal(tooManyFindings.status, 400);
});

test("requires moderation.user authorization", async () => {
  const response = await decide([], "moderation.tester");

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
});
