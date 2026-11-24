/**
 * Small fixed-window attempt limiter for password endpoints.
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

export function tooManyAttempts(key: string): boolean {
  const now = Date.now();
  const bucket = buckets.get(key);
  if (!bucket || now >= bucket.resetAt) {
    buckets.set(key, { count: 1, resetAt: now + WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > MAX_ATTEMPTS;
}

export function clearAttempts(key: string): void {
  buckets.delete(key);
}
