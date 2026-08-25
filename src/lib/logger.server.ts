import pino from "pino";
import pinoPretty from "pino-pretty";

const isDev = process.env.NODE_ENV === "development";

let logger: pino.Logger;

if (isDev) {
  const transport = pinoPretty({ colorize: true }) as any;
  logger = pino({ level: "debug", transport });
} else {
  logger = pino();
}

export const { debug, info, warn, error } = logger;
