/**
 * Small fixed-window attempt limiter for password and PIN endpoints.
 *
 * shortcut: state lives in this process's memory, so it resets on restart and
 * is per-replica. That is enough to blunt scripted guessing in this app; move
 * to a shared store if it ever runs behind several long-lived instances.
 */

const WINDOW_MS = 15 * 60 * 1000;
const MAX_ATTEMPTS = 10;

const buckets = new Map<string, { count: number; resetAt: number }>();

export function clientKey(request: Request, route: string): string {
  const forwarded = request.headers.get("x-forwarded-for") || "";
  const ip = forwarded.split(",")[0].trim() || request.headers.get("x-real-ip") || "unknown";
  return `${route}:${ip}`;
}

/**
 * Record an attempt for `key` and report whether it is over the limit.
 * PIN locks are per person (`pin:<userId>`) rather than per IP, because one
 * kitchen tablet shares an IP between every child in the house.
 */
export function tooManyAttempts(
  key: string,
  options: { max?: number; windowMs?: number } = {},
): boolean {
  const limit = options.max ?? MAX_ATTEMPTS;
  const windowMs = options.windowMs ?? WINDOW_MS;
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + windowMs });
    return false;
  }
  bucket.count += 1;
  return bucket.count > limit;
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}
