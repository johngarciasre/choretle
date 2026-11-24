import { NextRequest, NextResponse } from "next/server";
import { getSupabaseMiddlewareClient } from "@/lib/supabase";
import { DEV_COOKIE_NAME, verifyDevSession } from "@/lib/dev-auth";
import { getRawDb } from "@/db/drizzle";
import { error } from "@/lib/logger.server";

function hasSupabaseConfig(): boolean {
  return !!(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
}

interface DbUser {
  id: string;
  email: string;
  name: string;
  role: string;
  family_id: string | null;
}

function readDbUser(column: "id" | "email", value: string): DbUser | null {
  const rawDb = getRawDb();
  if (!rawDb) return null;
  try {
    return (rawDb.prepare(`SELECT id, email, name, role, family_id FROM users WHERE ${column} = ?`).get(value) as DbUser) || null;
  } catch {
    return null;
  }
}

function readFamilyName(familyId: string | null): string | null {
  if (!familyId) return null;
  const rawDb = getRawDb();
  if (!rawDb) return null;
  try {
    const row = rawDb.prepare(`SELECT name FROM families WHERE id = ?`).get(familyId) as { name?: string } | undefined;
    return row?.name || null;
  } catch {
    return null;
  }
}

export async function GET(request: NextRequest) {
  try {
    if (process.env.AUTH_MODE === "dev") {
      const cookieHeader = request.headers.get("cookie") || "";
      const setCookie = cookieHeader.split(";").find((c: string) => c.includes(DEV_COOKIE_NAME));
      if (!setCookie) return NextResponse.json({ authenticated: false });
      const value = setCookie.replace(`${DEV_COOKIE_NAME}=`, "").trim();
      const sessionUser = await verifyDevSession(value);
      if (!sessionUser) return NextResponse.json({ authenticated: false });

      // Look up by email instead of user ID — the auto-created session id is not
      // the database id until the user signs up, but the email is stable.
      const dbUser = readDbUser("email", (sessionUser.email || "").toLowerCase());
      return NextResponse.json({
        authenticated: true,
        user: {
          id: dbUser?.id || sessionUser.id,
          email: dbUser?.email || sessionUser.email,
          name: dbUser?.name || sessionUser.name || "",
          role: dbUser?.role || sessionUser.role || "child",
        },
        familyId: dbUser?.family_id || null,
        familyName: readFamilyName(dbUser?.family_id || null),
      });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ error: "Server configuration error" }, { status: 500 });
    }

    const supabase = await getSupabaseMiddlewareClient(request);
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) {
      return NextResponse.json({ authenticated: false });
    }

    // Resolve the family here: middleware runs on the edge and cannot open SQLite.
    const dbUser = readDbUser("id", session.user.id);
    return NextResponse.json({
      authenticated: true,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: dbUser?.name || session.user.user_metadata?.name || "",
        role: dbUser?.role || session.user.user_metadata?.role || "child",
      },
      familyId: dbUser?.family_id || null,
      familyName: readFamilyName(dbUser?.family_id || null),
    });
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Auth/me GET failed");
    return NextResponse.json({ error: "Failed to get auth status" }, { status: 500 });
  }
}
