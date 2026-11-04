import { randomUUID } from "node:crypto";
import { RequestHandler } from "express";

const validRequestId = /^[A-Za-z0-9._:-]{1,128}$/;

export const requestIdMiddleware: RequestHandler = (req, res, next) => {
  const suppliedId = req.header("X-Correlation-Id");
  const requestId =
    suppliedId && validRequestId.test(suppliedId) ? suppliedId : randomUUID();

  res.locals.requestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
};
