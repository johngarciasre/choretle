/**
 * Smoke test: every route+method the client actually calls is invoked once with
 * a signed-in parent and an empty JSON body. A missing handler (the harness
 * reports "Handler not found") or any 5xx fails.
 *
 * Route-specific behaviour lives in the other integration tests; this one exists
 * so a route cannot be 404/405/500'd by the UI without the suite noticing.
 */
import { describe, it, expect, beforeEach } from "vitest";
import { routeTable, clientCalls, resolveRoute } from "../api-inventory";
import { TestHarness } from "./harness";
import { resetDb } from "@/db";

interface Target {
  method: "GET" | "POST" | "PUT" | "DELETE";
  routePath: string;
  params: Record<string, string>;
}

function smokeTargets(): Target[] {
  const routes = routeTable();
  const seen = new Map<string, Target>();

  for (const call of clientCalls()) {
    const route = resolveRoute(call, routes);
    if (!route) continue; // route-contract.test.ts reports the miss
    const routePath = `/api/${route.segments.join("/")}`;
    const key = `${call.method} ${routePath}`;
    if (seen.has(key)) continue;
    const params = Object.fromEntries(
      route.segments.filter((s) => s.startsWith("[")).map((s) => [s.slice(1, -1), "missing-id"]),
    );
    seen.set(key, { method: call.method as Target["method"], routePath, params });
  }
  return [...seen.values()];
}

const targets = smokeTargets();

describe("API route smoke", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("covers the client's routes and methods", () => {
    expect(targets.length).toBeGreaterThan(25);
  });

  it.each(targets.map((t) => [`${t.method} ${t.routePath}`, t] as const))(
    "%s responds without a server error",
    async (_label, target) => {
      const harness = new TestHarness();
      await harness.signIn("smoke@choretle.dev");

      const body = target.method === "GET" ? undefined : {};
      const res = await harness.invokeHandler(target.routePath, target.method, body, target.params);

      expect(res.body?.error).not.toBe("Handler not found");
      expect(res.body?.error).not.toBe("Method not found");
      expect(res.status).not.toBe(405);
      expect(res.status).toBeLessThan(500);
    },
  );
});
