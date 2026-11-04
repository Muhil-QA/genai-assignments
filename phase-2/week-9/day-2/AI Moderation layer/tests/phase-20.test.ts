import assert from "node:assert/strict";
import express from "express";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { createAuditMiddleware } from "../src/middleware/audit.middleware";
import { requestIdMiddleware } from "../src/middleware/request-id.middleware";

const signingSecret = Buffer.from(
  "phase-20-test-secret-with-at-least-32-bytes",
);
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(role = "moderation.user") {
  return new SignJWT({ sub: "phase-20-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function postReview(
  body: unknown,
  role = "moderation.user",
  correlationId = "phase-20-review-request",
) {
  const token = await createToken(role);
  return request(app)
    .post("/api/v1/reviews")
    .set("Authorization", `Bearer ${token}`)
    .set("X-Correlation-Id", correlationId)
    .send(body);
}

test("creates a pending review and lists it only for reviewers", async () => {
  const response = await postReview({
    findingCategories: ["HIGH_IMPACT_ACTION"],
    ruleIds: ["TOOL_ACTION_APPROVAL_REQUIRED"],
  });

  assert.equal(response.status, 202);
  assert.match(response.body.reviewId, /^REV-[0-9a-f-]{36}$/);
  assert.equal(response.body.status, "PENDING");
  assert.equal(response.body.decision, "ESCALATE");

  const reviewerToken = await createToken("moderation.reviewer");
  const reviews = await request(app)
    .get("/api/v1/reviews/escalations")
    .set("Authorization", `Bearer ${reviewerToken}`);

  assert.equal(reviews.status, 200);
  assert.equal(reviews.body.reviews.length, 1);
  assert.equal(reviews.body.reviews[0].reviewId, response.body.reviewId);
  assert.equal(
    reviews.body.reviews[0].requestId,
    "phase-20-review-request",
  );
  assert.deepEqual(reviews.body.reviews[0].findingCategories, [
    "HIGH_IMPACT_ACTION",
  ]);
  assert.deepEqual(reviews.body.reviews[0].ruleIds, [
    "TOOL_ACTION_APPROVAL_REQUIRED",
  ]);
});

test("automatically creates a review when the combined decision is ESCALATE", async () => {
  const token = await createToken();
  const response = await request(app)
    .post("/api/v1/decision")
    .set("Authorization", `Bearer ${token}`)
    .send({
      findings: [
        { control: "HIGH_IMPACT_ACTION", recommendedAction: "ESCALATE" },
      ],
    });

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ESCALATE");
  assert.equal(response.body.reviewStatus, "PENDING");
  assert.match(response.body.reviewId, /^REV-[0-9a-f-]{36}$/);
});

test("rejects malformed or content-bearing review requests", async () => {
  const invalid = await postReview({
    findingCategories: ["HIGH_IMPACT_ACTION"],
    ruleIds: ["VALID_RULE"],
    content: "private raw document text",
  });

  assert.equal(invalid.status, 400);
  assert.equal(invalid.body.error, "INVALID_REQUEST");
  assert.equal(JSON.stringify(invalid.body).includes("private raw"), false);
});

test("requires authentication and reviewer role to list escalations", async () => {
  const unauthenticated = await request(app).get(
    "/api/v1/reviews/escalations",
  );
  assert.equal(unauthenticated.status, 401);

  const userToken = await createToken("moderation.user");
  const forbidden = await request(app)
    .get("/api/v1/reviews/escalations")
    .set("Authorization", `Bearer ${userToken}`);
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");
});

test("audit logs correlate decisions and safe identifiers without raw content", async () => {
  const events: Record<string, unknown>[] = [];
  const auditApp = express();
  auditApp.use(express.json());
  auditApp.use(requestIdMiddleware);
  auditApp.use(
    createAuditMiddleware("test-policy", {
      info: (event) => events.push(event as Record<string, unknown>),
    }),
  );
  auditApp.post("/audit-check", (req, res) => {
    res.status(200).json({
      decision: "BLOCK",
      content: req.body.content,
      findings: [
        {
          category: "SECRET_DETECTED",
          ruleId: "SECRET_RULE_1",
          value: req.body.content,
        },
      ],
    });
  });

  const rawSecret = "private-api-key-value";
  const response = await request(auditApp)
    .post("/audit-check")
    .set("X-Correlation-Id", "audit-correlation-1")
    .send({ content: rawSecret });

  assert.equal(response.status, 200);
  assert.equal(events.length, 1);
  const event = events[0];
  assert.equal(event.event, "audit_event");
  assert.equal(event.requestId, "audit-correlation-1");
  assert.equal(event.decision, "BLOCK");
  assert.equal(event.httpStatus, 200);
  assert.deepEqual(event.findingCategories, ["SECRET_DETECTED"]);
  assert.deepEqual(event.ruleIds, ["SECRET_RULE_1"]);
  assert.equal(JSON.stringify(event).includes(rawSecret), false);
});
