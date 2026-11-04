import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";

interface RegressionCase {
  id: string;
  content: string;
  expectedDecision: string;
  expectedSafe: boolean;
  expectedSanitizedContent?: string;
  expectedHttpStatus?: number;
  mustNotEcho?: boolean;
}

interface RegressionPack {
  version: string;
  cases: RegressionCase[];
}

function loadRegressionPack(): RegressionPack {
  const filePath = path.resolve(
    process.cwd(),
    "tests/fixtures/standalone-regression-v1.json",
  );
  const parsed: unknown = JSON.parse(readFileSync(filePath, "utf8"));
  if (
    typeof parsed !== "object" ||
    parsed === null ||
    Array.isArray(parsed)
  ) {
    throw new Error("Standalone regression pack must be an object.");
  }

  const pack = parsed as Partial<RegressionPack>;
  if (
    typeof pack.version !== "string" ||
    pack.version.trim().length === 0 ||
    !Array.isArray(pack.cases) ||
    pack.cases.length === 0
  ) {
    throw new Error("Standalone regression pack must have a version and cases.");
  }

  const ids = new Set<string>();
  for (const [index, entry] of pack.cases.entries()) {
    if (
      typeof entry !== "object" ||
      entry === null ||
      typeof entry.id !== "string" ||
      !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(entry.id) ||
      ids.has(entry.id) ||
      typeof entry.content !== "string" ||
      entry.content.trim().length === 0 ||
      typeof entry.expectedDecision !== "string" ||
      typeof entry.expectedSafe !== "boolean" ||
      (entry.expectedSanitizedContent !== undefined &&
        typeof entry.expectedSanitizedContent !== "string") ||
      (entry.expectedHttpStatus !== undefined &&
        ![200, 202].includes(entry.expectedHttpStatus)) ||
      (entry.mustNotEcho !== undefined &&
        typeof entry.mustNotEcho !== "boolean")
    ) {
      throw new Error(`Standalone regression case at index ${index} is invalid.`);
    }
    ids.add(entry.id);
  }

  return pack as RegressionPack;
}

const regressionPack = loadRegressionPack();
const signingSecret = Buffer.from(
  "standalone-regression-test-secret-with-32-bytes",
);
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
);

async function createToken(): Promise<string> {
  return new SignJWT({
    sub: "standalone-regression-client",
    roles: ["moderation.user"],
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

test(`runs standalone moderation regression pack v${regressionPack.version}`, async (t) => {
  const token = await createToken();

  for (const regressionCase of regressionPack.cases) {
    await t.test(regressionCase.id, async () => {
      const response = await request(app)
        .post("/api/v1/moderate")
        .set("Authorization", `Bearer ${token}`)
        .send({
          content: regressionCase.content,
          applicationId: `regression-${regressionCase.id}`,
        });

      assert.equal(
        response.status,
        regressionCase.expectedHttpStatus ?? 200,
      );
      assert.equal(response.body.decision, regressionCase.expectedDecision);
      assert.equal(response.body.safe, regressionCase.expectedSafe);
      assert.ok(response.body.requestId);

      if (regressionCase.expectedSanitizedContent !== undefined) {
        assert.equal(
          response.body.sanitizedContent,
          regressionCase.expectedSanitizedContent,
        );
      }
      if (
        regressionCase.expectedDecision === "BLOCK" ||
        regressionCase.expectedDecision === "ESCALATE" ||
        regressionCase.expectedDecision === "SAFE_RESPONSE"
      ) {
        assert.equal(Object.hasOwn(response.body, "sanitizedContent"), false);
      }
      if (regressionCase.mustNotEcho) {
        assert.equal(
          JSON.stringify(response.body).includes(regressionCase.content),
          false,
        );
      }
      if (regressionCase.expectedDecision === "ESCALATE") {
        assert.equal(response.body.reviewStatus, "PENDING");
      }
      if (regressionCase.id === "self-harm-fixture-response") {
        assert.equal(
          response.body.responseTemplate,
          "SELF_HARM_SUPPORT_V1",
        );
      }
      if (regressionCase.id === "child-safety-fixture-block") {
        assert.match(response.body.securityEventId, /^SEC-[0-9a-f-]{36}$/);
      }
    });
  }
});
