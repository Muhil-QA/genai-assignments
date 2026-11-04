import { randomUUID } from "node:crypto";

export interface ReviewRecord {
  reviewId: string;
  requestId: string;
  status: "PENDING";
  decision: "ESCALATE";
  createdAt: string;
  requesterSubject: string;
  findingCategories: string[];
  ruleIds: string[];
}

export interface CreateReviewInput {
  requestId: string;
  requesterSubject: string;
  findingCategories: string[];
  ruleIds: string[];
}

export interface ReviewStore {
  create(input: CreateReviewInput): ReviewRecord | null;
  listPending(): ReviewRecord[];
}

const maximumPendingReviews = 1000;

export function createReviewStore(): ReviewStore {
  const reviews = new Map<string, ReviewRecord>();

  return {
    create(input) {
      if (reviews.size >= maximumPendingReviews) {
        return null;
      }

      const record: ReviewRecord = {
        reviewId: `REV-${randomUUID()}`,
        requestId: input.requestId,
        status: "PENDING",
        decision: "ESCALATE",
        createdAt: new Date().toISOString(),
        requesterSubject: input.requesterSubject,
        findingCategories: [...input.findingCategories],
        ruleIds: [...input.ruleIds],
      };
      reviews.set(record.reviewId, record);
      return { ...record };
    },
    listPending() {
      return [...reviews.values()].map((record) => ({
        ...record,
        findingCategories: [...record.findingCategories],
        ruleIds: [...record.ruleIds],
      }));
    },
  };
}

const identifierPattern = /^[A-Za-z][A-Za-z0-9_.:-]{0,127}$/;
const maximumFindings = 50;

function isIdentifierList(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.length > 0 &&
    value.length <= maximumFindings &&
    value.every(
      (item) => typeof item === "string" && identifierPattern.test(item),
    ) &&
    new Set(value).size === value.length
  );
}

export function validateCreateReviewRequest(
  body: unknown,
): Pick<CreateReviewInput, "findingCategories" | "ruleIds"> | null {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return null;
  }

  const payload = body as Record<string, unknown>;
  if (
    Object.keys(payload).length !== 2 ||
    !Object.hasOwn(payload, "findingCategories") ||
    !Object.hasOwn(payload, "ruleIds") ||
    !isIdentifierList(payload.findingCategories) ||
    !isIdentifierList(payload.ruleIds)
  ) {
    return null;
  }

  return {
    findingCategories: [...payload.findingCategories],
    ruleIds: [...payload.ruleIds],
  };
}
