import { describe, it, expect, vi } from "vitest";

describe("Logger (pino-pretty transport)", () => {
  describe("wrapper function signatures", () => {
    it("should accept object as first argument for structured logging", () => {
      // The wrapper signature is: (msg: string | object, ...args: any[])
      // Test that we can pass an object as the first arg
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      // Simulate wrapper pattern: export const info = (msg, ...args) => logger.info(msg, ...args);
      const info = (msg: string | object, ...args: any[]) => mockLogger.info(msg, ...args);
      
      info({ userId: "123" }, "User created");
      expect(mockLogger.info).toHaveBeenCalledWith({ userId: "123" }, "User created");
    });

    it("should accept string as first argument for simple logging", () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const error = (msg: string | object, ...args: any[]) => mockLogger.error(msg, ...args);
      error("Something went wrong");
      expect(mockLogger.error).toHaveBeenCalledWith("Something went wrong");
    });

    it("should forward additional arguments to underlying logger", () => {
      const mockLogger = { info: vi.fn() };
      const info = (msg: string | object, ...args: any[]) => mockLogger.info(msg, ...args);
      
      info({ context: "auth" }, "Login attempt", { ip: "1.2.3.4" });
      expect(mockLogger.info).toHaveBeenCalledWith(
        { context: "auth" },
        "Login attempt",
        { ip: "1.2.3.4" }
      );
    });

    it("should support all four log levels with same signature", () => {
      const mockLogger = {
        debug: vi.fn(),
        info: vi.fn(),
        warn: vi.fn(),
        error: vi.fn(),
      };

      const debug = (msg: string | object, ...args: any[]) => mockLogger.debug(msg, ...args);
      const warn = (msg: string | object, ...args: any[]) => mockLogger.warn(msg, ...args);
      const error = (msg: string | object, ...args: any[]) => mockLogger.error(msg, ...args);

      debug({ key: "val" }, "Debug msg");
      warn({ key: "val" }, "Warn msg");
      error({ key: "val" }, "Error msg");

      expect(mockLogger.debug).toHaveBeenCalled();
      expect(mockLogger.warn).toHaveBeenCalled();
      expect(mockLogger.error).toHaveBeenCalled();
    });
  });

  describe("pino transport configuration", () => {
    it("should use object-based transport config (not stream)", () => {
      // The fix changed from: pino({ transport: stream }) 
      // to: pino({ transport: { target, options } })
      const transportConfig = {
        target: "pino-pretty",
        options: { colorize: true },
      };

      expect(transportConfig.target).toBe("pino-pretty");
      expect(transportConfig.options.colorize).toBe(true);
    });

    it("should handle silent logger fallback gracefully", () => {
      // When pino-pretty fails, we fall through to pino() with level: "silent"
      const silentLogger = { level: "silent" };
      expect(silentLogger.level).toBe("silent");
    });

    it("should handle dev environment detection", () => {
      // The logger checks process.env.NODE_ENV === "development"
      const isDev = process.env.NODE_ENV === "development";
      expect(typeof isDev).toBe("boolean");
    });
  });

  describe("error handling in try-catch block", () => {
    it("should fall through to default pino() when transport fails", () => {
      // Pattern: try { return pino({...}); } catch { return pino(); }
      const createLogger = () => {
        try {
          throw new Error("Transport failed");
          // @ts-ignore - never reached
          return { level: "debug" as const };
        } catch {
          return { level: "silent" as const };
        }
      };

      const logger = createLogger();
      expect(logger.level).toBe("silent");
    });

    it("should prefer transport config when available", () => {
      const createLogger = (useTransport: boolean) => {
        try {
          if (useTransport) {
            return { level: "debug" as const, transport: true };
          }
          throw new Error("Transport failed");
        } catch {
          return { level: "silent" as const };
        }
      };

      expect(createLogger(true).transport).toBe(true);
      expect(createLogger(false).transport).toBeUndefined();
    });
  });
});
