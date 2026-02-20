import pino from "pino";

export const logger = pino({
  level: process.env.ACS_LOG_LEVEL ?? "info",
  timestamp: pino.stdTimeFunctions.isoTime,
  formatters: {
    level(label) {
      return { level: label };
    }
  }
});
