import { RequestHandler } from "express";
import {
  createRemoteJWKSet,
  jwtVerify,
  JWTVerifyGetKey,
} from "jose";
import { AuthenticationConfig } from "../config";
import {
  AuthenticatedPrincipal,
  isRole,
} from "./authorization.middleware";

function getVerificationKey(
  config: AuthenticationConfig,
): Uint8Array | JWTVerifyGetKey {
  return config.mode === "local"
    ? config.secret
    : createRemoteJWKSet(config.jwksUrl);
}

export function createAuthenticationMiddleware(
  config: AuthenticationConfig,
): RequestHandler {
  const key = getVerificationKey(config);
  const claims =
    config.mode === "oidc"
      ? { issuer: config.issuer, audience: config.audience }
      : { issuer: "genai-guardrail-gateway-local" };

  return async (req, res, next) => {
    const authorization = req.header("Authorization");
    const match = authorization?.match(/^Bearer ([^\s]+)$/i);
    if (!match) {
      res.status(401).json({
        requestId: res.locals.requestId,
        error: "UNAUTHENTICATED",
      });
      return;
    }

    try {
      const { payload } = await jwtVerify(match[1], key, {
        ...claims,
        algorithms: config.mode === "local" ? ["HS256"] : undefined,
        requiredClaims: ["exp"],
      });
      if (
        typeof payload.sub !== "string" ||
        payload.sub.length === 0 ||
        (payload.roles !== undefined &&
          (!Array.isArray(payload.roles) ||
            !payload.roles.every((role) => typeof role === "string"))) ||
        (payload.tenantId !== undefined &&
          (typeof payload.tenantId !== "string" ||
            !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(payload.tenantId))) ||
        (payload.ragRoles !== undefined &&
          (!Array.isArray(payload.ragRoles) ||
            !payload.ragRoles.every(
              (role) =>
                typeof role === "string" &&
                /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/.test(role),
            )))
      ) {
        throw new Error("JWT identity claims are invalid.");
      }

      const principal: AuthenticatedPrincipal = {
        subject: payload.sub,
        roles: Array.isArray(payload.roles)
          ? payload.roles.filter(isRole)
          : [],
        ...(typeof payload.tenantId === "string"
          ? { tenantId: payload.tenantId }
          : {}),
        ragRoles: Array.isArray(payload.ragRoles)
          ? [...new Set(payload.ragRoles as string[])]
          : [],
      };
      res.locals.principal = principal;
      next();
    } catch {
      res.status(401).json({
        requestId: res.locals.requestId,
        error: "UNAUTHENTICATED",
      });
    }
  };
}
