import assert from "node:assert/strict";
import { test } from "node:test";
import { SignJWT } from "jose";
import request from "supertest";
import { createApp } from "../src/app";
import { loadSecretRules } from "../src/middleware/secret-detector";
import { loadResourceLimits } from "../src/middleware/resource-limits";

const signingSecret = Buffer.from(
  "phase-07-test-secret-with-at-least-32-bytes",
);
const resourceLimits = loadResourceLimits();
const app = createApp(
  { status: "READY", policyVersion: "1.0.0" },
  { mode: "local", secret: signingSecret },
  loadSecretRules(),
  resourceLimits,
);
const validPdf = Buffer.from(
  "%PDF-1.7\n1 0 obj\n<< /Type /Catalog >>\nendobj\nstartxref\n0\n%%EOF\n",
);

async function createToken(role: "moderation.tester" | "moderation.user") {
  return new SignJWT({ sub: "phase-07-test-client", roles: [role] })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime("15m")
    .sign(signingSecret);
}

async function uploadPdf(
  options: {
    filename?: string;
    contentType?: string;
    content?: Buffer;
    token?: string;
  } = {},
) {
  const token = options.token ?? (await createToken("moderation.tester"));
  return request(app)
    .post("/api/v1/validate/file")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", options.content ?? validPdf, {
      filename: options.filename ?? "sample.pdf",
      contentType: options.contentType ?? "application/pdf",
    });
}

test("accepts a structurally valid PDF and returns only safe metadata", async () => {
  const response = await uploadPdf();

  assert.equal(response.status, 200);
  assert.equal(response.body.valid, true);
  assert.equal(response.body.detectedType, "application/pdf");
  assert.equal(response.body.recommendedAction, "ALLOW");
  assert.ok(response.body.requestId);
  assert.equal(JSON.stringify(response.body).includes("sample.pdf"), false);
});

test("rejects a multipart form with no file", async () => {
  const token = await createToken("moderation.tester");
  const boundary = "phase07-empty-boundary";
  const response = await request(app)
    .post("/api/v1/validate/file")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
    .send(Buffer.from(`--${boundary}--\r\n`));

  assert.equal(response.status, 400);
  assert.equal(response.body.error, "FILE_REQUIRED");
});

test("rejects an executable renamed with a PDF extension", async () => {
  const response = await uploadPdf({
    content: Buffer.from("MZ executable content"),
  });

  assert.equal(response.status, 415);
  assert.equal(response.body.error, "FILE_SIGNATURE_MISMATCH");
});

test("rejects unsupported extensions and MIME types", async () => {
  const wrongExtension = await uploadPdf({ filename: "sample.exe" });
  assert.equal(wrongExtension.status, 415);
  assert.equal(wrongExtension.body.error, "UNSUPPORTED_FILE_TYPE");

  const wrongMime = await uploadPdf({ contentType: "application/octet-stream" });
  assert.equal(wrongMime.status, 415);
  assert.equal(wrongMime.body.error, "UNSUPPORTED_FILE_TYPE");
});

test("sanitizes path traversal filenames without echoing the supplied path", async () => {
  const token = await createToken("moderation.tester");
  const boundary = "phase07-file-boundary";
  const multipartBody = Buffer.concat([
    Buffer.from(
      `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="../../sample.pdf"\r\nContent-Type: application/pdf\r\n\r\n`,
    ),
    validPdf,
    Buffer.from(`\r\n--${boundary}--\r\n`),
  ]);
  const response = await request(app)
    .post("/api/v1/validate/file")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", `multipart/form-data; boundary=${boundary}`)
    .send(multipartBody);

  assert.equal(response.status, 200);
  assert.equal(response.body.valid, true);
  assert.equal(JSON.stringify(response.body).includes("../../sample.pdf"), false);
});

test("rejects empty and structurally corrupt PDF files", async () => {
  const empty = await uploadPdf({ content: Buffer.alloc(0) });
  assert.equal(empty.status, 400);
  assert.equal(empty.body.error, "CORRUPT_FILE");

  const corrupt = await uploadPdf({
    content: Buffer.from("%PDF-1.7\nno end marker"),
  });
  assert.equal(corrupt.status, 400);
  assert.equal(corrupt.body.error, "CORRUPT_FILE");
});

test("enforces the configured per-file size limit", async () => {
  const limits = {
    ...resourceLimits,
    fileUpload: { ...resourceLimits.fileUpload, maximumFileSizeBytes: 32 },
  };
  const limitedApp = createApp(
    { status: "READY", policyVersion: "1.0.0" },
    { mode: "local", secret: signingSecret },
    loadSecretRules(),
    limits,
  );
  const token = await createToken("moderation.tester");
  const response = await request(limitedApp)
    .post("/api/v1/validate/file")
    .set("Authorization", `Bearer ${token}`)
    .attach("file", validPdf, {
      filename: "sample.pdf",
      contentType: "application/pdf",
    });

  assert.equal(response.status, 413);
  assert.equal(response.body.error, "PAYLOAD_TOO_LARGE");
});

test("requires multipart/form-data content type", async () => {
  const token = await createToken("moderation.tester");
  const response = await request(app)
    .post("/api/v1/validate/file")
    .set("Authorization", `Bearer ${token}`)
    .set("Content-Type", "application/json")
    .send({ filename: "sample.pdf" });

  assert.equal(response.status, 415);
  assert.equal(response.body.error, "UNSUPPORTED_MEDIA_TYPE");
});

test("restricts file validation to moderation.tester", async () => {
  const token = await createToken("moderation.user");
  const response = await uploadPdf({ token });

  assert.equal(response.status, 403);
  assert.equal(response.body.error, "FORBIDDEN");
});
