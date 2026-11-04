import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AuthenticatedPrincipal } from "./authorization.middleware";

export type ToolRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ToolParameterType = "string" | "identifier" | "email" | "enum";

export interface ToolParameter {
  type: ToolParameterType;
  maximumLength?: number;
  values?: string[];
}

export interface ToolActionPolicy {
  tool: string;
  action: string;
  allowedRoles: string[];
  risk: ToolRisk;
  approvalRequired: boolean;
  parameters: {
    required: string[];
    properties: Record<string, ToolParameter>;
  };
  allowedRecipientDomains?: string[];
  tenantScopedResourceArgument?: string;
}

export interface ToolTargetResource {
  tool: string;
  action: string;
  resourceId: string;
  tenantId: string;
}

export interface ToolActionPolicyConfig {
  version: string;
  idempotencyWindowMs: number;
  maximumTrackedActionIds: number;
  tools: ToolActionPolicy[];
  resources: ToolTargetResource[];
}

export interface ToolActionRequest {
  actionId: string;
  tool: string;
  action: string;
  arguments: Record<string, unknown>;
}

export interface ToolActionDecision {
  decision: "ALLOW" | "ESCALATE" | "BLOCK";
  approvalRequired: boolean;
  reviewReason?: "HIGH_IMPACT_ACTION";
}

interface ToolActionsFile {
  version: string;
  idempotencyWindowMs: number;
  maximumTrackedActionIds: number;
  tools: Array<{
    tool: string;
    action: string;
    allowedRoles: string[];
    risk: string;
    approvalRequired: boolean;
    parameters: {
      required: string[];
      properties: Record<
        string,
        {
          type: string;
          maximumLength?: number;
          values?: string[];
        }
      >;
    };
    allowedRecipientDomains?: string[];
    tenantScopedResourceArgument?: string;
  }>;
  resources: ToolTargetResource[];
}

const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const parameterTypes: ToolParameterType[] = [
  "string",
  "identifier",
  "email",
  "enum",
];
const risks: ToolRisk[] = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isPositiveInteger(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

export function loadToolActionPolicy(
  filePath = path.resolve(
    process.cwd(),
    process.env.TOOL_ACTIONS_PATH ?? "config/tool-actions.yaml",
  ),
): ToolActionPolicyConfig {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`Tool action policy could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (!isRecord(parsed)) {
    throw new Error("Tool action policy must be an object.");
  }

  const config = parsed as Partial<ToolActionsFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !isPositiveInteger(config.idempotencyWindowMs) ||
    !isPositiveInteger(config.maximumTrackedActionIds) ||
    !Array.isArray(config.tools) ||
    config.tools.length === 0 ||
    !Array.isArray(config.resources)
  ) {
    throw new Error("Tool action policy contains invalid top-level values.");
  }

  const seenActions = new Set<string>();
  const tools = config.tools.map((entry, index): ToolActionPolicy => {
    if (!isRecord(entry) || !isRecord(entry.parameters)) {
      throw new Error(`Tool action at index ${index} is invalid.`);
    }

    const { properties, required } = entry.parameters;
    if (
      typeof entry.tool !== "string" ||
      !identifierPattern.test(entry.tool) ||
      typeof entry.action !== "string" ||
      !identifierPattern.test(entry.action) ||
      !Array.isArray(entry.allowedRoles) ||
      entry.allowedRoles.length === 0 ||
      !entry.allowedRoles.every(
        (role) => typeof role === "string" && identifierPattern.test(role),
      ) ||
      typeof entry.risk !== "string" ||
      !risks.includes(entry.risk as ToolRisk) ||
      typeof entry.approvalRequired !== "boolean" ||
      ((entry.risk === "HIGH" || entry.risk === "CRITICAL") &&
        entry.approvalRequired !== true) ||
      !Array.isArray(required) ||
      !required.every((name) => typeof name === "string") ||
      !isRecord(properties) ||
      required.some(
        (name) =>
          !Object.hasOwn(properties, name) ||
          typeof name !== "string" ||
          !identifierPattern.test(name),
      ) ||
      Object.keys(properties).some((name) => !required.includes(name))
    ) {
      throw new Error(`Tool action at index ${index} is invalid.`);
    }

    const key = `${entry.tool}:${entry.action}`;
    if (seenActions.has(key)) {
      throw new Error(`Tool action "${key}" is duplicated.`);
    }
    seenActions.add(key);

    const parsedProperties: Record<string, ToolParameter> = {};
    for (const [name, rawParameter] of Object.entries(properties)) {
      if (!isRecord(rawParameter) || typeof rawParameter.type !== "string") {
        throw new Error(`Parameter "${name}" on tool action "${key}" is invalid.`);
      }

      const type = rawParameter.type as ToolParameterType;
      if (
        !parameterTypes.includes(type) ||
        (type === "enum" &&
          (!Array.isArray(rawParameter.values) ||
            rawParameter.values.length === 0 ||
            !rawParameter.values.every(
              (value) => typeof value === "string" && value.length > 0,
            ))) ||
        (type !== "enum" && rawParameter.values !== undefined) ||
        (type !== "enum" &&
          rawParameter.maximumLength !== undefined &&
          !isPositiveInteger(rawParameter.maximumLength)) ||
        (type === "enum" && rawParameter.maximumLength !== undefined)
      ) {
        throw new Error(`Parameter "${name}" on tool action "${key}" is invalid.`);
      }

      parsedProperties[name] = {
        type,
        ...(rawParameter.maximumLength !== undefined
          ? { maximumLength: rawParameter.maximumLength }
          : {}),
        ...(type === "enum" ? { values: [...rawParameter.values!] } : {}),
      };
    }

    if (
      entry.allowedRecipientDomains !== undefined &&
      (!Array.isArray(entry.allowedRecipientDomains) ||
        entry.allowedRecipientDomains.length === 0 ||
        !entry.allowedRecipientDomains.every(
          (domain) =>
            typeof domain === "string" &&
            /^[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(domain),
        ))
    ) {
      throw new Error(`Recipient domain policy for "${key}" is invalid.`);
    }

    if (
      entry.tenantScopedResourceArgument !== undefined &&
      (typeof entry.tenantScopedResourceArgument !== "string" ||
        !Object.hasOwn(
          parsedProperties,
          entry.tenantScopedResourceArgument,
        ))
    ) {
      throw new Error(`Tenant resource policy for "${key}" is invalid.`);
    }

    return {
      tool: entry.tool,
      action: entry.action,
      allowedRoles: [...new Set(entry.allowedRoles)],
      risk: entry.risk as ToolRisk,
      approvalRequired: entry.approvalRequired,
      parameters: {
        required: [...required],
        properties: parsedProperties,
      },
      ...(entry.allowedRecipientDomains
        ? { allowedRecipientDomains: [...entry.allowedRecipientDomains] }
        : {}),
      ...(entry.tenantScopedResourceArgument
        ? { tenantScopedResourceArgument: entry.tenantScopedResourceArgument }
        : {}),
    };
  });

  const resources = config.resources.map((resource, index) => {
    if (
      !isRecord(resource) ||
      typeof resource.tool !== "string" ||
      !identifierPattern.test(resource.tool) ||
      typeof resource.action !== "string" ||
      !identifierPattern.test(resource.action) ||
      typeof resource.resourceId !== "string" ||
      !identifierPattern.test(resource.resourceId) ||
      typeof resource.tenantId !== "string" ||
      !identifierPattern.test(resource.tenantId)
    ) {
      throw new Error(`Tool target resource at index ${index} is invalid.`);
    }
    return {
      tool: resource.tool,
      action: resource.action,
      resourceId: resource.resourceId,
      tenantId: resource.tenantId,
    };
  });

  const resourceKeys = new Set<string>();
  for (const resource of resources) {
    const key = `${resource.tool}:${resource.action}:${resource.resourceId}`;
    if (resourceKeys.has(key)) {
      throw new Error(`Tool target resource "${key}" is duplicated.`);
    }
    resourceKeys.add(key);
    if (
      !tools.some(
        (tool) =>
          tool.tool === resource.tool &&
          tool.action === resource.action &&
          tool.tenantScopedResourceArgument !== undefined,
      )
    ) {
      throw new Error(`Tool target resource "${key}" has no matching policy.`);
    }
  }

  return {
    version: config.version,
    idempotencyWindowMs: config.idempotencyWindowMs,
    maximumTrackedActionIds: config.maximumTrackedActionIds,
    tools,
    resources,
  };
}

export function validateToolActionRequest(
  body: unknown,
): ToolActionRequest | null {
  if (!isRecord(body)) {
    return null;
  }

  if (
    Object.keys(body).length !== 4 ||
    !Object.hasOwn(body, "actionId") ||
    !Object.hasOwn(body, "tool") ||
    !Object.hasOwn(body, "action") ||
    !Object.hasOwn(body, "arguments") ||
    typeof body.actionId !== "string" ||
    !identifierPattern.test(body.actionId) ||
    typeof body.tool !== "string" ||
    !identifierPattern.test(body.tool) ||
    typeof body.action !== "string" ||
    !identifierPattern.test(body.action) ||
    !isRecord(body.arguments)
  ) {
    return null;
  }

  return {
    actionId: body.actionId,
    tool: body.tool,
    action: body.action,
    arguments: body.arguments,
  };
}

function validParameter(value: unknown, parameter: ToolParameter): boolean {
  if (parameter.type === "enum") {
    return typeof value === "string" && parameter.values!.includes(value);
  }

  if (typeof value !== "string" || value.trim().length === 0) {
    return false;
  }

  if (
    parameter.maximumLength !== undefined &&
    [...value].length > parameter.maximumLength
  ) {
    return false;
  }

  if (parameter.type === "identifier") {
    return identifierPattern.test(value);
  }
  if (parameter.type === "email") {
    return /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/.test(
      value,
    );
  }
  return true;
}

export type ToolActionValidation =
  | { kind: "decision"; result: ToolActionDecision }
  | { kind: "replay" }
  | { kind: "capacity" };

export function createToolActionValidator(config: ToolActionPolicyConfig) {
  const usedActionIds = new Map<string, number>();

  return function validateToolAction(
    request: ToolActionRequest,
    principal: AuthenticatedPrincipal,
    now = Date.now(),
  ): ToolActionValidation {
    for (const [key, expiresAt] of usedActionIds) {
      if (expiresAt <= now) {
        usedActionIds.delete(key);
      }
    }

    const replayKey = `${principal.subject}:${request.actionId}`;
    if (usedActionIds.has(replayKey)) {
      return { kind: "replay" };
    }
    if (usedActionIds.size >= config.maximumTrackedActionIds) {
      return { kind: "capacity" };
    }

    usedActionIds.set(
      replayKey,
      now + config.idempotencyWindowMs,
    );

    const policy = config.tools.find(
      (entry) =>
        entry.tool === request.tool && entry.action === request.action,
    );
    if (!policy) {
      return {
        kind: "decision",
        result: { decision: "BLOCK", approvalRequired: false },
      };
    }

    if (
      !principal.tenantId ||
      !policy.allowedRoles.some((role) => principal.ragRoles.includes(role)) ||
      Object.keys(request.arguments).length !==
        Object.keys(policy.parameters.properties).length ||
      Object.keys(policy.parameters.properties).some(
        (name) =>
          !Object.hasOwn(request.arguments, name) ||
          !validParameter(
            request.arguments[name],
            policy.parameters.properties[name],
          ),
      )
    ) {
      return {
        kind: "decision",
        result: { decision: "BLOCK", approvalRequired: false },
      };
    }

    if (
      policy.allowedRecipientDomains &&
      typeof request.arguments.recipient === "string"
    ) {
      const domain = request.arguments.recipient
        .slice(request.arguments.recipient.lastIndexOf("@") + 1)
        .toLowerCase();
      if (
        !policy.allowedRecipientDomains.some(
          (allowedDomain) => allowedDomain.toLowerCase() === domain,
        )
      ) {
        return {
          kind: "decision",
          result: { decision: "BLOCK", approvalRequired: false },
        };
      }
    }

    if (policy.tenantScopedResourceArgument) {
      const resourceId = request.arguments[
        policy.tenantScopedResourceArgument
      ];
      const resource = config.resources.find(
        (entry) =>
          entry.tool === policy.tool &&
          entry.action === policy.action &&
          entry.resourceId === resourceId,
      );
      if (
        !resource ||
        !principal.tenantId ||
        resource.tenantId !== principal.tenantId
      ) {
        return {
          kind: "decision",
          result: { decision: "BLOCK", approvalRequired: false },
        };
      }
    }

    return {
      kind: "decision",
      result: policy.approvalRequired
        ? {
            decision: "ESCALATE",
            approvalRequired: true,
            reviewReason: "HIGH_IMPACT_ACTION",
          }
        : { decision: "ALLOW", approvalRequired: false },
    };
  };
}
