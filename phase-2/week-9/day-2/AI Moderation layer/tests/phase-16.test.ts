import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadToolActionPolicy } from "../src/middleware/tool-action-validator";

const signingSecret = Buffer.from(
  "phase-16-test-secret-with-at-least-32-bytes",
);
const policy = loadToolActionPolicy();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(
  ragRoles: string[] = ["user", "support-agent", "admin", "release-manager"],
  role = "moderation.user",
  tenantId: string | null = "TENANT-A",
) {
  return new SignJWT({
    sub: "phase-16-test-client",
    roles: [role],
    ragRoles,
    ...(tenantId ? { tenantId } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function validateAction(
  body: unknown,
  options?: {
    ragRoles?: string[];
    role?: string;
    tenantId?: string | null;
  },
) {
  const token = await createToken(
    options?.ragRoles,
    options?.role,
    options?.tenantId,
  );
  return request(app)
    .post("/api/v1/tools/validate-action")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

function actionRequest(
  overrides: {
    actionId?: string;
    tool?: string;
    action?: string;
    arguments?: Record<string, unknown>;
  } = {},
) {
  return {
    actionId: overrides.actionId ?? `action-${randomUUID()}`,
    tool: overrides.tool ?? "searchKnowledge",
    action: overrides.action ?? "search",
    arguments: overrides.arguments ?? { query: "product cancellation limits" },
  };
}

test("allows a role-authorized read-only search action", async () => {
  const response = await validateAction(actionRequest(), {
    ragRoles: ["user"],
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.decision, "ALLOW");
  assert.equal(response.body.approvalRequired, false);
});

test("allows email only for approved domain and exact parameter schema", async () => {
  const allowed = await validateAction(
    actionRequest({
      tool: "email",
      action: "send",
      arguments: {
        recipient: "approved@example.com",
        templateId: "WELCOME-01",
      },
    }),
    { ragRoles: ["support-agent"] },
  );
  assert.equal(allowed.body.decision, "ALLOW");

  const blocked = await validateAction(
    actionRequest({
      tool: "email",
      action: "send",
      arguments: {
        recipient: "attacker@outside.example",
        templateId: "WELCOME-01",
      },
    }),
    { ragRoles: ["support-agent"] },
  );
  assert.equal(blocked.body.decision, "BLOCK");
});

test("escalates customer deletion and production deployment for human approval", async () => {
  const deletion = await validateAction(
    actionRequest({
      tool: "deleteCustomer",
      action: "delete",
      arguments: { customerId: "CUST-101" },
    }),
    { ragRoles: ["admin"] },
  );
  assert.equal(deletion.body.decision, "ESCALATE");
  assert.equal(deletion.body.approvalRequired, true);
  assert.equal(deletion.body.reviewReason, "HIGH_IMPACT_ACTION");

  const deployment = await validateAction(
    actionRequest({
      tool: "deployProduction",
      action: "deploy",
      arguments: { environment: "production", version: "v1.2.3" },
    }),
    { ragRoles: ["release-manager"] },
  );
  assert.equal(deployment.body.decision, "ESCALATE");
  assert.equal(deployment.body.approvalRequired, true);
});

test("blocks unknown tools and unauthorized business roles", async () => {
  const unknown = await validateAction(
    actionRequest({ tool: "shell", action: "execute", arguments: {} }),
  );
  assert.equal(unknown.body.decision, "BLOCK");
  assert.equal(unknown.body.approvalRequired, false);

  const unauthorized = await validateAction(actionRequest(), {
    ragRoles: ["claims-agent"],
  });
  assert.equal(unauthorized.body.decision, "BLOCK");

  const missingTenant = await validateAction(actionRequest(), {
    ragRoles: ["user"],
    tenantId: null,
  });
  assert.equal(missingTenant.body.decision, "BLOCK");
});

test("blocks parameter tampering, malformed schemas, and cross-tenant resources", async () => {
  const extraParameter = await validateAction(
    actionRequest({
      arguments: {
        query: "search",
        tenantId: "TENANT-A",
      },
    }),
  );
  assert.equal(extraParameter.body.decision, "BLOCK");

  const targetTampering = await validateAction(
    actionRequest({
      tool: "deleteCustomer",
      action: "delete",
      arguments: { customerId: "CUST-999" },
    }),
    { ragRoles: ["admin"] },
  );
  assert.equal(targetTampering.body.decision, "BLOCK");

  const crossTenant = await validateAction(
    actionRequest({
      tool: "deleteCustomer",
      action: "delete",
      arguments: { customerId: "CUST-101" },
    }),
    { ragRoles: ["admin"], tenantId: "TENANT-B" },
  );
  assert.equal(crossTenant.body.decision, "BLOCK");
});

test("rejects a replayed action ID with HTTP 409", async () => {
  const body = actionRequest({ actionId: "replay-test-1" });
  const first = await validateAction(body);
  const replay = await validateAction(body);

  assert.equal(first.status, 200);
  assert.equal(first.body.decision, "ALLOW");
  assert.equal(replay.status, 409);
  assert.equal(replay.body.error, "ACTION_REPLAYED");
});

test("rejects malformed requests and requires the authenticated moderation role", async () => {
  const malformed = await validateAction({
    ...actionRequest(),
    arguments: { query: "safe", unexpected: true },
    extra: true,
  });
  assert.equal(malformed.status, 400);
  assert.equal(malformed.body.error, "INVALID_REQUEST");

  const forbidden = await validateAction(actionRequest(), {
    role: "moderation.tester",
  });
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");
});

test("loads policy-controlled idempotency bounds and tool definitions", () => {
  assert.equal(policy.idempotencyWindowMs, 600_000);
  assert.equal(policy.maximumTrackedActionIds, 10_000);
  assert.ok(policy.tools.some((tool) => tool.tool === "deployProduction"));
});
