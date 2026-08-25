import pino from "pino";
import pinoPretty from "pino-pretty";

const isDev = process.env.NODE_ENV === "development";
const isBrowser = typeof window !== "undefined";

let logger: pino.Logger;

if (isBrowser) {
  // Client-side: use silent logger to avoid bundling issues with pino/browser.js
  logger = pino({ level: "silent" });
} else if (isDev) {
  // Server-side dev: use pino-pretty for colored output
  const transport = pinoPretty({ colorize: true }) as any;
  logger = pino({ level: "debug", transport });
} else {
  // Server-side prod: default pino
  logger = pino();
}

export const { debug, info, warn, error } = logger;
