/**
 * Supabase Client Setup for Choretle
 * 
 * This module provides typed, environment-aware Supabase client instances
 * for use across different runtime contexts (server components, server actions, middleware).
 * 
 * All clients are Edge-compatible and work in Next.js App Router.
 */

// ─── Middleware/Server Action Client (for API routes and server actions) ──
// Used in: API routes, server actions, middleware
// Storage: cookies or headers

import { createServerClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Gets a Supabase client instance configured for use in API routes and middleware.
 * Uses cookie-based authentication and is Edge-compatible.
 * 
 * @param request - The Next.js request object
 * @returns A typed Supabase client instance
 */
export async function getSupabaseMiddleware(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
          }
        },
      },
    }
  );
}

/**
 * Gets a Supabase client instance configured for use in Next.js Middleware.
 * Uses cookie-based authentication and is Edge-compatible.
 * 
 * @param request - The Next.js request object
 * @returns A typed Supabase client instance
 */
export async function getSupabaseMiddlewareClient(request: NextRequest) {
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          for (const cookie of cookiesToSet) {
            request.cookies.set(cookie.name, cookie.value);
          }
        },
      },
    }
  );
}
