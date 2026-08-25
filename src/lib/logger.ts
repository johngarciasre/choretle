import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

let logger: pino.Logger;

if (isDev) {
  const prettyTransport = pino.pinoPretty({
    colorize: true,
  });
  logger = pino({
    level: "debug",
    transport: prettyTransport,
  });
} else {
  logger = pino({
    level: "info",
  });
}

export const { debug, info, warn, error } = logger;
