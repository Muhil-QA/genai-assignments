import pino from "pino";

const sensitivePaths = [
  "authorization",
  "password",
  "passwd",
  "secret",
  "token",
  "api_key",
  "apiKey",
  "private_key",
  "privateKey",
  "content",
  "**.authorization",
  "**.password",
  "**.passwd",
  "**.secret",
  "**.token",
  "**.api_key",
  "**.apiKey",
  "**.private_key",
  "**.privateKey",
  "**.content",
];

export function createLogger(destination?: pino.DestinationStream) {
  return pino(
    {
      redact: {
        paths: sensitivePaths,
        censor: "[REDACTED]",
      },
    },
    destination,
  );
}

export const logger = createLogger();
