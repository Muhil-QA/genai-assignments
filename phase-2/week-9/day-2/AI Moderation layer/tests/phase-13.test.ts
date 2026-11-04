import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadRagDocuments } from "../src/middleware/rag-authorization";

const signingSecret = Buffer.from(
  "phase-13-test-secret-with-at-least-32-bytes",
);
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(
  {
    role = "moderation.user",
    tenantId = "TENANT-A",
    ragRoles = ["claims-agent"],
  }: {
    role?: string;
    tenantId?: string;
    ragRoles?: string[];
  } = {},
) {
  return new SignJWT({
    sub: "phase-13-test-client",
    roles: [role],
    tenantId,
    ragRoles,
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

function authorizationBody(overrides: {
  user?: { tenantId: string; roles: string[] };
  document?: {
    documentId: string;
    tenantId: string;
    classification: "PUBLIC" | "INTERNAL" | "CONFIDENTIAL" | "RESTRICTED";
  };
} = {}) {
  return {
    user: overrides.user ?? {
      tenantId: "TENANT-A",
      roles: ["claims-agent"],
    },
    document: overrides.document ?? {
      documentId: "DOC-101",
      tenantId: "TENANT-A",
      classification: "CONFIDENTIAL" as const,
    },
  };
}

async function authorize(
  body: unknown = authorizationBody(),
  tokenOptions?: Parameters<typeof createToken>[0],
) {
  const token = await createToken(tokenOptions);
  return request(app)
    .post("/api/v1/rag/authorize")
    .set("Authorization", `Bearer ${token}`)
    .send(body);
}

test("allows a signed same-tenant user with a registry-authorized role", async () => {
  const response = await authorize();

  assert.equal(response.status, 200);
  assert.equal(response.body.authorized, true);
  assert.equal(response.body.recommendedAction, "ALLOW");
  assert.ok(response.body.requestId);
});

test("blocks a user from a different tenant", async () => {
  const response = await authorize(
    authorizationBody({
      user: { tenantId: "TENANT-B", roles: ["claims-agent"] },
    }),
    { tenantId: "TENANT-B" },
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.authorized, false);
  assert.equal(response.body.recommendedAction, "BLOCK");
});

test("blocks forged user identity and role assertions that do not match JWT claims", async () => {
  const forgedUser = await authorize(
    authorizationBody({
      user: { tenantId: "TENANT-B", roles: ["claims-agent"] },
    }),
  );
  assert.equal(forgedUser.body.authorized, false);
  assert.equal(forgedUser.body.recommendedAction, "BLOCK");

  const forgedRole = await authorize(
    authorizationBody({
      user: { tenantId: "TENANT-A", roles: ["admin"] },
    }),
  );
  assert.equal(forgedRole.body.authorized, false);
  assert.equal(forgedRole.body.recommendedAction, "BLOCK");
});

test("blocks roles not allowed by the authoritative document registry", async () => {
  const response = await authorize(authorizationBody(), {
    tenantId: "TENANT-A",
    ragRoles: ["underwriter"],
  });

  assert.equal(response.body.authorized, false);
  assert.equal(response.body.recommendedAction, "BLOCK");
});

test("blocks deleted and expired documents", async () => {
  const deleted = await authorize(
    authorizationBody({
      document: {
        documentId: "DOC-102",
        tenantId: "TENANT-A",
        classification: "CONFIDENTIAL",
      },
    }),
  );
  assert.equal(deleted.body.authorized, false);
  assert.equal(deleted.body.recommendedAction, "BLOCK");

  const expired = await authorize(
    authorizationBody({
      document: {
        documentId: "DOC-103",
        tenantId: "TENANT-A",
        classification: "CONFIDENTIAL",
      },
    }),
  );
  assert.equal(expired.body.authorized, false);
  assert.equal(expired.body.recommendedAction, "BLOCK");
});

test("blocks client-supplied document metadata that differs from the registry", async () => {
  const response = await authorize(
    authorizationBody({
      document: {
        documentId: "DOC-101",
        tenantId: "TENANT-B",
        classification: "CONFIDENTIAL",
      },
    }),
  );

  assert.equal(response.body.authorized, false);
  assert.equal(response.body.recommendedAction, "BLOCK");
});

test("rejects malformed or extra authorization fields, including similarity score", async () => {
  const response = await authorize({
    ...authorizationBody(),
    similarityScore: 0.99,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "INVALID_REQUEST");
});

test("blocks unknown documents and requires the authenticated moderation role", async () => {
  const unknown = await authorize(
    authorizationBody({
      document: {
        documentId: "DOC-UNKNOWN",
        tenantId: "TENANT-A",
        classification: "CONFIDENTIAL",
      },
    }),
  );
  assert.equal(unknown.body.authorized, false);
  assert.equal(unknown.body.recommendedAction, "BLOCK");

  const testerToken = await createToken({ role: "moderation.tester" });
  const forbidden = await request(app)
    .post("/api/v1/rag/authorize")
    .set("Authorization", `Bearer ${testerToken}`)
    .send(authorizationBody());
  assert.equal(forbidden.status, 403);
  assert.equal(forbidden.body.error, "FORBIDDEN");
});

test("requires document access policy records to be loaded", () => {
  const documents = loadRagDocuments();
  assert.ok(documents.some((document) => document.documentId === "DOC-101"));
  assert.ok(
    documents.every(
      (document) =>
        document.allowedRoles.length > 0 &&
        (document.status === "ACTIVE" || document.status === "DELETED"),
    ),
  );
});
