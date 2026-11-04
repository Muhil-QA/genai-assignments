import { createApp } from "./app";
import { loadStartupConfig } from "./config";
import { logger } from "./utils/logger";

const config = loadStartupConfig();

if (config.readiness.status === "NOT_READY") {
  logger.error({
    event: "startup_configuration_invalid",
    reason: config.readiness.reason,
  });
}

createApp(
  config.readiness,
  config.authentication,
  config.secretRules,
  config.resourceLimits,
  config.piiRules,
  config.confidentialPolicy,
  config.injectionPolicy,
  config.jailbreakPolicy,
  config.normalizationPolicy,
  config.ragDocuments,
  config.toolActionPolicy,
  config.decisionPolicy,
  config.outputValidationPolicy,
  config.contentSafetyPolicy,
  config.misusePolicy,
  config.harmfulContentPolicy,
  config.violenceThreatPolicy,
  config.sexualSafetyPolicy,
  config.selfHarmPolicy,
).listen(
  config.port,
  () => {
    logger.info({
      event: "server_started",
      port: config.port,
    });
  },
);
