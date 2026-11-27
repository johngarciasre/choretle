/**
 * PIN hashing. PBKDF2-SHA256 with a per-user salt, verified only in Node route
 * handlers — `middleware.ts` runs on Edge and must never import this module.
 *
 * A PIN is an ordered sequence of emoji IDs (`smile`, `rocket`, …), not glyphs.
 */

import { randomBytes, pbkdf2Sync, timingSafeEqual } from "node:crypto";
import { PIN_LENGTH, isValidPin } from "./pin-emoji";

const ITERATIONS = 210_000;
const KEY_LENGTH = 32;
const DIGEST = "sha256";

export function hashPin(pin: string[]): string {
  const salt = randomBytes(16);
  const hash = pbkdf2Sync(pin.join(":"), salt, ITERATIONS, KEY_LENGTH, DIGEST);
  return `pbkdf2$${DIGEST}$${ITERATIONS}$${salt.toString("base64")}$${hash.toString("base64")}`;
}

export function verifyPin(pin: string[], stored: string | null | undefined): boolean {
  if (!stored || !isValidPin(pin)) return false;
  const parts = stored.split("$");
  if (parts.length !== 5 || parts[0] !== "pbkdf2" || parts[1] !== DIGEST) return false;
  const iterations = Number(parts[2]);
  if (!Number.isFinite(iterations) || iterations <= 0) return false;
  try {
    const salt = Buffer.from(parts[3], "base64");
    const expected = Buffer.from(parts[4], "base64");
    const actual = pbkdf2Sync(pin.join(":"), salt, iterations, expected.length, DIGEST);
    return expected.length === actual.length && timingSafeEqual(expected, actual);
  } catch {
    return false;
  }
}

export { PIN_LENGTH, isValidPin };
