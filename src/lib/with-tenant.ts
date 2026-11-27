import type { NextRequest } from "next/server";
import { verifyAuth, verifyPicker } from "./auth";
import { cacheSet, runWithTenant } from "@/db/tenant";

type Handler<C> = (request: NextRequest, context: C) => Promise<Response> | Response;

/**
 * Routes that create or find an identity before a household is known. They run
 * as the table owner, which is the only way to look a person up across tenants.
 */
const OWNER_ONLY = ["/api/auth/signup", "/api/auth/signin", "/api/auth/signout"];

/**
 * Run a route handler inside its household's RLS scope.
 *
 * The tenant is resolved once here (outside any scope, as the table owner) and
 * then every statement the handler makes runs in a transaction that sets
 * `app.household_id` and switches to the policy-bound role. Requests with no
 * session — sign-in, sign-up, health — fall through unscoped, which is what lets
 * them look a person up before a household is known.
 */
export function withTenant<C>(handler: Handler<C>): Handler<C> {
  return async (request, context) => {
    if (OWNER_ONLY.some((path) => request.nextUrl.pathname.startsWith(path))) {
      return handler(request, context);
    }

    const auth = await verifyAuth(request);
    if (auth?.householdId) {
      return runWithTenant(auth.householdId, () => {
        cacheSet("auth", auth);
        return Promise.resolve(handler(request, context));
      });
    }

    const picker = await verifyPicker(request);
    if (picker?.householdId) {
      return runWithTenant(picker.householdId, () => {
        cacheSet("picker", picker);
        return Promise.resolve(handler(request, context));
      });
    }

    return handler(request, context);
  };
}
