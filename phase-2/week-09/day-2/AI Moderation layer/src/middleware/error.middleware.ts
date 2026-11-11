import { ErrorRequestHandler, RequestHandler } from "express";
import multer from "multer";
import { logger } from "../utils/logger";

export const notFoundMiddleware: RequestHandler = (_req, res) => {
  res.status(404).json({
    requestId: res.locals.requestId,
    error: {
      code: "NOT_FOUND",
      message: "Route not found.",
    },
  });
};

export const errorMiddleware: ErrorRequestHandler = (error, _req, res, _next) => {
  if (error instanceof multer.MulterError) {
    const tooLarge = error.code === "LIMIT_FILE_SIZE";
    res.status(tooLarge ? 413 : 400).json({
      requestId: res.locals.requestId,
      error: tooLarge ? "PAYLOAD_TOO_LARGE" : "INVALID_UPLOAD",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.too.large"
  ) {
    res.status(413).json({
      requestId: res.locals.requestId,
      error: "PAYLOAD_TOO_LARGE",
    });
    return;
  }

  if (
    typeof error === "object" &&
    error !== null &&
    "type" in error &&
    error.type === "entity.parse.failed"
  ) {
    res.status(400).json({
      requestId: res.locals.requestId,
      error: "INVALID_REQUEST",
      fields: ["body"],
    });
    return;
  }

  const errorType =
    error instanceof Error ? error.name : "UnknownRequestError";
  logger.error({
    event: "request_failed",
    requestId: res.locals.requestId,
    errorType,
  });

  res.status(500).json({
    requestId: res.locals.requestId,
    error: {
      code: "INTERNAL_SERVER_ERROR",
      message: "An unexpected error occurred.",
    },
  });
};
