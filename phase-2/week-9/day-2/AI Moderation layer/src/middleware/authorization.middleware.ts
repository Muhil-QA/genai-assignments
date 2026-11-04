import { RequestHandler } from "express";

export const roles = [
  "moderation.user",
  "moderation.tester",
  "moderation.reviewer",
  "moderation.admin",
] as const;

export type Role = (typeof roles)[number];

export interface AuthenticatedPrincipal {
  subject: string;
  roles: Role[];
  tenantId?: string;
  ragRoles: string[];
}

export function isRole(value: string): value is Role {
  return (roles as readonly string[]).includes(value);
}

export function requireRole(role: Role): RequestHandler {
  return (_req, res, next) => {
    const principal = res.locals.principal as
      | AuthenticatedPrincipal
      | undefined;

    if (!principal?.roles.includes(role)) {
      res.status(403).json({
        requestId: res.locals.requestId,
        error: "FORBIDDEN",
      });
      return;
    }

    next();
  };
}
