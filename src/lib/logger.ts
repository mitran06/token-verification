import "server-only";
import pino from "pino";

// Structured JSON logs to stdout (no worker transport, so it bundles cleanly in
// the standalone server and is captured by Docker).
export const logger = pino({ level: process.env.LOG_LEVEL ?? "info" });
