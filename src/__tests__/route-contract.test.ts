/**
 * Contract test: every /api call in client code must resolve to a route handler
 * that exports the method the client uses.
 *
 * This is the check that was missing when /api/users PUT+DELETE, PATCH on
 * /api/household/[householdId] and /api/household/swap-meet silently 404/405'd while the
 * suite stayed green: integration tests only exercise the routes they name.
 */
import { describe, it, expect } from "vitest";
import { routeTable, clientCalls, resolveRoute } from "./api-inventory";

describe("client/API contract", () => {
  const routes = routeTable();
  const calls = clientCalls();

  it("finds both routes and client calls in the source tree", () => {
    expect(routes.length).toBeGreaterThan(30);
    expect(calls.length).toBeGreaterThan(30);
  });

  it("every client call hits an existing route with the right method", () => {
    const broken = calls.flatMap((call) => {
      const route = resolveRoute(call, routes);
      const url = `/api/${call.segments.join("/")}`;
      if (!route) return [{ file: call.file, reason: `${call.method} ${url} — no route handler` }];
      if (!route.methods.has(call.method)) {
        return [{ file: call.file, reason: `${call.method} ${url} — handler exports ${[...route.methods].join(", ") || "nothing"}` }];
      }
      return [];
    });

    expect(broken).toEqual([]);
  });
});
