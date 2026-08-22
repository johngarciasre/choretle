import { NextRequest } from "next/server";

/**
 * Gets the current user from middleware-validated headers.
 * This is the centralized auth check - all protected routes should use this instead of duplicate verifyAuth() functions.
 */
export function getServerUser(request: Request) {
  const userId = request.headers.get("x-user-id");
  
  if (!userId) {
    return null;
  }

  return { id: userId };
}
