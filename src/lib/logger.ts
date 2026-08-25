import pino from "pino";

const isDev = process.env.NODE_ENV === "development";
const isBrowser = typeof window !== "undefined";

let logger: pino.Logger;

if (isBrowser) {
  // Client-side: use silent logger to avoid bundling issues with pino/browser.js
  logger = pino({ level: "silent" });
} else if (isDev) {
  // Server-side dev: dynamically import pino-pretty to prevent client bundling
  const { default: pinoPretty } = await import("pino-pretty");
  const transport = pinoPretty({ colorize: true }) as any;
  logger = pino({ level: "debug", transport });
} else {
  // Server-side prod: default pino
  logger = pino();
}

export const { debug, info, warn, error } = logger;
