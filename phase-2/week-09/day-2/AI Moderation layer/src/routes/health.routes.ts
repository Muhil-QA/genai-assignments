import { Router } from "express";
import { ReadinessState } from "../config";

export function createHealthRouter(readiness: ReadinessState): Router {
  const router = Router();

  router.get("/health", (_req, res) => {
    res.status(200).json({
      status: "UP",
      service: "genai-guardrail-gateway",
    });
  });

  router.get("/ready", (_req, res) => {
    if (readiness.status === "NOT_READY") {
      res.status(503).json({
        status: "NOT_READY",
        service: "genai-guardrail-gateway",
      });
      return;
    }

    res.status(200).json({
      status: "READY",
      policyVersion: readiness.policyVersion,
    });
  });

  return router;
}
