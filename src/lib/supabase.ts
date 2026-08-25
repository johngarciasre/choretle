/**
 * Supabase Client Setup for Choretle
 * 
 * This module provides typed, environment-aware Supabase client instances
 * for use across different runtime contexts (server components, server actions, middleware).
 * 
 * All clients are Edge-compatible and work in Next.js App Router.
 */

import { createServerClient, createBrowserClient } from "@supabase/ssr";
import { NextRequest, NextResponse } from "next/server";

/**
 * Gets a Supabase client instance configured for use in API routes and middleware.
 * Uses cookie-based authentication and is Edge-compatible.
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

/**
 * Gets a Supabase client instance for use in client components and hooks.
 */
export function getSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  );
}

/**
 * Gets the Supabase session from a request.
 */
export async function getSession(request: NextRequest) {
  const supabase = await getSupabaseMiddlewareClient(request);
  return supabase.auth.getSession();
}
