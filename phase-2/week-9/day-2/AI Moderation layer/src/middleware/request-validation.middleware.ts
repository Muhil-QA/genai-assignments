import { RequestHandler } from "express";

const maximumContentLength = 10_000;
const applicationIdPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
const metadataFields = new Set(["channel", "locale"]);

function invalidRequest(res: Parameters<RequestHandler>[1], fields: string[]) {
  res.status(400).json({
    requestId: res.locals.requestId,
    error: "INVALID_REQUEST",
    fields: [...new Set(fields)],
  });
}

export const requireJsonContentType: RequestHandler = (req, res, next) => {
  if (!req.is("application/json")) {
    res.status(415).json({
      requestId: res.locals.requestId,
      error: "UNSUPPORTED_MEDIA_TYPE",
      fields: ["content-type"],
    });
    return;
  }

  next();
};

function createContentValidator(requireApplicationId: boolean): RequestHandler {
  return (req, res, next) => {
    const body: unknown = req.body;
    if (typeof body !== "object" || body === null || Array.isArray(body)) {
      invalidRequest(res, ["body"]);
      return;
    }

    const payload = body as Record<string, unknown>;
    const fields: string[] = [];
    const allowedFields = requireApplicationId
      ? new Set(["content", "applicationId", "conversationId", "metadata"])
      : new Set(["content"]);

    if (Object.keys(payload).some((field) => !allowedFields.has(field))) {
      fields.push("body");
    }

    const content = payload.content;
    if (
      typeof content !== "string" ||
      content.trim().length === 0 ||
      [...content].length > maximumContentLength
    ) {
      fields.push("content");
    }

    if (requireApplicationId) {
      const applicationId = payload.applicationId;
      if (
        typeof applicationId !== "string" ||
        !applicationIdPattern.test(applicationId)
      ) {
        fields.push("applicationId");
      }

      const conversationId = payload.conversationId;
      if (
        conversationId !== undefined &&
        (typeof conversationId !== "string" ||
          conversationId.trim().length === 0 ||
          [...conversationId].length > 128)
      ) {
        fields.push("conversationId");
      }

      const metadata = payload.metadata;
      if (metadata !== undefined) {
        if (
          typeof metadata !== "object" ||
          metadata === null ||
          Array.isArray(metadata)
        ) {
          fields.push("metadata");
        } else {
          const metadataRecord = metadata as Record<string, unknown>;
          if (
            Object.keys(metadataRecord).some(
              (field) => !metadataFields.has(field),
            ) ||
            Object.values(metadataRecord).some(
              (value) => typeof value !== "string" || value.length > 128,
            )
          ) {
            fields.push("metadata");
          }
        }
      }
    }

    if (fields.length > 0) {
      invalidRequest(res, fields);
      return;
    }

    next();
  };
}

export const validateModerationRequest = createContentValidator(true);
export const validateContentRequest = createContentValidator(false);

export const validateTokenRequest: RequestHandler = (req, res, next) => {
  const body: unknown = req.body;
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    invalidRequest(res, ["body"]);
    return;
  }

  const payload = body as Record<string, unknown>;
  const fields: string[] = [];
  if (
    Object.keys(payload).some(
      (field) => field !== "content" && field !== "applicationId",
    )
  ) {
    fields.push("body");
  }

  if (
    typeof payload.content !== "string" ||
    payload.content.trim().length === 0
  ) {
    fields.push("content");
  }

  if (
    payload.applicationId !== undefined &&
    (typeof payload.applicationId !== "string" ||
      !applicationIdPattern.test(payload.applicationId))
  ) {
    fields.push("applicationId");
  }

  if (fields.length > 0) {
    invalidRequest(res, fields);
    return;
  }

  next();
};
