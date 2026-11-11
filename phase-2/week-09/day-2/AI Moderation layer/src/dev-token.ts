import { SignJWT } from "jose";
import { loadStartupConfig } from "./config";
import { isRole } from "./middleware/authorization.middleware";

async function main(): Promise<void> {
  const { authentication } = loadStartupConfig();
  if (authentication.mode !== "local") {
    throw new Error("Development tokens are available only in local auth mode.");
  }

  const args = process.argv.slice(2);
  let role = "moderation.user";
  let tenantId: string | undefined;
  const ragRoles: string[] = [];
  let expired = false;
  let roleProvided = false;

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === "--expired") {
      expired = true;
      continue;
    }

    if (argument === "--tenant-id" || argument === "--rag-role") {
      const value = args[index + 1];
      if (!value || value.startsWith("--")) {
        throw new Error(`${argument} requires a value.`);
      }
      index += 1;
      if (argument === "--tenant-id") {
        tenantId = value;
      } else {
        ragRoles.push(value);
      }
      continue;
    }

    if (argument.startsWith("--")) {
      throw new Error(`Unknown option "${argument}".`);
    }
    if (roleProvided) {
      throw new Error(`Unexpected argument "${argument}".`);
    }
    role = argument;
    roleProvided = true;
  }

  if (!isRole(role)) {
    throw new Error(
      "Role must be moderation.user, moderation.tester, moderation.reviewer, or moderation.admin.",
    );
  }

  const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
  if (tenantId !== undefined && !identifierPattern.test(tenantId)) {
    throw new Error("--tenant-id must be a valid tenant identifier.");
  }
  if (ragRoles.some((ragRole) => !identifierPattern.test(ragRole))) {
    throw new Error("--rag-role values must be valid role identifiers.");
  }
  if (new Set(ragRoles).size !== ragRoles.length) {
    throw new Error("--rag-role values must be unique.");
  }

  const expiration = expired ? "0s" : "15m";
  const token = await new SignJWT({
    sub: "postman-test-client",
    roles: [role],
    ...(tenantId ? { tenantId } : {}),
    ...(ragRoles.length > 0 ? { ragRoles } : {}),
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuer("genai-guardrail-gateway-local")
    .setIssuedAt()
    .setExpirationTime(expiration)
    .sign(authentication.secret);

  console.log(token);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : "Token generation failed.");
  process.exitCode = 1;
});
