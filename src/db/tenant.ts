/**
 * Request-scoped tenant context.
 *
 * Postgres enforces isolation with row-level security, which needs two things
 * for every statement: the household to scope to (`app.household_id`) and a
 * database role that is actually subject to policies (`choretle_app`, because
 * the table owner bypasses RLS unless it switches role).
 *
 * The tenant is carried in AsyncLocalStorage so the 300-odd existing
 * `db.prepare(...)` call sites do not have to thread a household through.
 * Route handlers enter it once, in `withTenant`, and every statement inside
 * runs in a transaction that sets the config and switches role.
 */

import { AsyncLocalStorage } from "node:async_hooks";

/** Must match the role created by `db/migrations/002_rls.sql`. */
export const APP_DB_ROLE = "choretle_app";

interface Store {
  householdId: string | null;
  cache: Map<string, unknown>;
}

const storage = new AsyncLocalStorage<Store>();

export function currentTenant(): string | null {
  return storage.getStore()?.householdId ?? null;
}

/**
 * Run `fn` with every statement scoped to `householdId`. Nested calls keep the
 * outermost household.
 */
export function runWithTenant<T>(householdId: string, fn: () => Promise<T>): Promise<T> {
  const existing = storage.getStore();
  if (existing) {
    if (!existing.householdId) existing.householdId = householdId;
    return fn();
  }
  return storage.run({ householdId, cache: new Map() }, fn);
}

/**
 * Escape hatch for the few deliberately cross-household reads (invite lookup by
 * code, the household switcher, Swap Meet, linked reports). Statements here run
 * as the table owner, so use it only where the route does its own authorisation.
 */
export function suspendTenant<T>(fn: () => Promise<T>): Promise<T> {
  return storage.exit(fn);
}

/** Per-request memo, so a route wrapper and its handler resolve auth once. */
export function cacheGet<T>(key: string): T | undefined {
  return storage.getStore()?.cache.get(key) as T | undefined;
}

export function cacheSet(key: string, value: unknown): void {
  storage.getStore()?.cache.set(key, value);
}

/** True inside a tenant scope; used by tests and the driver. */
export function hasTenantScope(): boolean {
  return !!storage.getStore();
}
