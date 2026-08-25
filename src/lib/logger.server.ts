import pino from "pino";

const isDev = process.env.NODE_ENV === "development";

let logger: pino.Logger;

try {
  if (isDev) {
    logger = pino({
      level: "debug",
      transport: {
        target: "pino-pretty",
        options: { colorize: true },
      },
    });
  } else {
    logger = pino();
  }
} catch {
  logger = pino({ level: "silent" });
}

export const debug = (msg: string | object, ...args: any[]) => logger.debug(msg, ...args);
export const info = (msg: string | object, ...args: any[]) => logger.info(msg, ...args);
export const warn = (msg: string | object, ...args: any[]) => logger.warn(msg, ...args);
export const error = (msg: string | object, ...args: any[]) => logger.error(msg, ...args);
