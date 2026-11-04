import { readFileSync } from "node:fs";
import path from "node:path";
import YAML from "yaml";
import { AuthenticatedPrincipal } from "./authorization.middleware";

export type RagClassification =
  | "PUBLIC"
  | "INTERNAL"
  | "CONFIDENTIAL"
  | "RESTRICTED";
export type RagDocumentStatus = "ACTIVE" | "DELETED";

export interface RagDocument {
  documentId: string;
  tenantId: string;
  classification: RagClassification;
  allowedRoles: string[];
  status: RagDocumentStatus;
  expiresAt?: string;
}

export interface RagAuthorizationRequest {
  user: {
    tenantId: string;
    roles: string[];
  };
  document: {
    documentId: string;
    tenantId: string;
    classification: RagClassification;
  };
}

interface RagDocumentsFile {
  version: string;
  documents: RagDocument[];
}

const classifications: RagClassification[] = [
  "PUBLIC",
  "INTERNAL",
  "CONFIDENTIAL",
  "RESTRICTED",
];
const identifierPattern = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export function loadRagDocuments(
  filePath = path.resolve(
    process.cwd(),
    process.env.RAG_DOCUMENTS_PATH ?? "config/rag-documents.yaml",
  ),
): RagDocument[] {
  let parsed: unknown;
  try {
    parsed = YAML.parse(readFileSync(filePath, "utf8"));
  } catch (error) {
    throw new Error(`RAG documents could not be loaded from "${filePath}".`, {
      cause: error,
    });
  }

  if (typeof parsed !== "object" || parsed === null) {
    throw new Error("RAG documents configuration must be an object.");
  }

  const config = parsed as Partial<RagDocumentsFile>;
  if (
    typeof config.version !== "string" ||
    config.version.trim().length === 0 ||
    !Array.isArray(config.documents) ||
    config.documents.length === 0
  ) {
    throw new Error(
      "RAG documents configuration must define a version and documents.",
    );
  }

  const documentIds = new Set<string>();
  return config.documents.map((document, index) => {
    if (
      typeof document !== "object" ||
      document === null ||
      !identifierPattern.test(document.documentId) ||
      !identifierPattern.test(document.tenantId) ||
      !classifications.includes(document.classification) ||
      !Array.isArray(document.allowedRoles) ||
      document.allowedRoles.length === 0 ||
      !document.allowedRoles.every(
        (role) => typeof role === "string" && identifierPattern.test(role),
      ) ||
      (document.status !== "ACTIVE" && document.status !== "DELETED") ||
      (document.expiresAt !== undefined &&
        (typeof document.expiresAt !== "string" ||
          Number.isNaN(Date.parse(document.expiresAt)))) ||
      documentIds.has(document.documentId)
    ) {
      throw new Error(`RAG document at index ${index} is invalid.`);
    }

    documentIds.add(document.documentId);
    return {
      documentId: document.documentId,
      tenantId: document.tenantId,
      classification: document.classification,
      allowedRoles: [...new Set(document.allowedRoles)],
      status: document.status,
      ...(document.expiresAt ? { expiresAt: document.expiresAt } : {}),
    };
  });
}

export function validateRagAuthorizationRequest(
  body: unknown,
): RagAuthorizationRequest | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 2 ||
    !Object.hasOwn(payload, "user") ||
    !Object.hasOwn(payload, "document")
  ) {
    return null;
  }

  const user = payload.user;
  const document = payload.document;
  if (
    typeof user !== "object" ||
    user === null ||
    Array.isArray(user) ||
    typeof document !== "object" ||
    document === null ||
    Array.isArray(document)
  ) {
    return null;
  }

  const userRecord = user as Record<string, unknown>;
  const documentRecord = document as Record<string, unknown>;
  if (
    Object.keys(userRecord).length !== 2 ||
    !Object.hasOwn(userRecord, "tenantId") ||
    !Object.hasOwn(userRecord, "roles") ||
    Object.keys(documentRecord).length !== 3 ||
    !Object.hasOwn(documentRecord, "documentId") ||
    !Object.hasOwn(documentRecord, "tenantId") ||
    !Object.hasOwn(documentRecord, "classification") ||
    typeof userRecord.tenantId !== "string" ||
    !identifierPattern.test(userRecord.tenantId) ||
    !Array.isArray(userRecord.roles) ||
    userRecord.roles.length === 0 ||
    !userRecord.roles.every(
      (role) => typeof role === "string" && identifierPattern.test(role),
    ) ||
    typeof documentRecord.documentId !== "string" ||
    !identifierPattern.test(documentRecord.documentId) ||
    typeof documentRecord.tenantId !== "string" ||
    !identifierPattern.test(documentRecord.tenantId) ||
    typeof documentRecord.classification !== "string" ||
    !classifications.includes(
      documentRecord.classification as RagClassification,
    )
  ) {
    return null;
  }

  return {
    user: {
      tenantId: userRecord.tenantId,
      roles: [...new Set(userRecord.roles as string[])],
    },
    document: {
      documentId: documentRecord.documentId,
      tenantId: documentRecord.tenantId,
      classification: documentRecord.classification as RagClassification,
    },
  };
}

export function isRagDocumentAuthorized(
  request: RagAuthorizationRequest,
  principal: AuthenticatedPrincipal,
  documents: RagDocument[],
  now = Date.now(),
): boolean {
  if (
    !principal.tenantId ||
    principal.tenantId !== request.user.tenantId ||
    request.user.roles.some((role) => !principal.ragRoles.includes(role))
  ) {
    return false;
  }

  const record = documents.find(
    (document) => document.documentId === request.document.documentId,
  );
  if (
    !record ||
    record.tenantId !== request.document.tenantId ||
    record.classification !== request.document.classification
  ) {
    return false;
  }

  return isRagDocumentRecordAuthorized(record, principal, now);
}

export function isRagDocumentRecordAuthorized(
  document: RagDocument,
  principal: AuthenticatedPrincipal,
  now = Date.now(),
): boolean {
  return (
    principal.tenantId === document.tenantId &&
    document.status === "ACTIVE" &&
    (document.expiresAt === undefined ||
      Date.parse(document.expiresAt) > now) &&
    principal.ragRoles.some((role) => document.allowedRoles.includes(role))
  );
}
