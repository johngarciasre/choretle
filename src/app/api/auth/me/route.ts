import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth, verifyPicker } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";
import { suspendTenant } from "@/db/tenant";

/**
 * Identity for the current request. Resolves adults (Supabase / dev cookie),
 * PIN sessions (kid, tablet adult) and picker tablets, which only ever learn the
 * household name so the lobby screen has something to render.
 */
async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);

    if (!auth) {
      const picker = await verifyPicker(request);
      if (picker) {
        const household = (await getDb()
          .prepare(`select name from households where id = ?`)
          .get(picker.householdId)) as { name?: string } | undefined;
        return noCache(
          NextResponse.json({
            authenticated: false,
            picker: { householdId: picker.householdId, householdName: household?.name ?? null },
          }),
        );
      }
      return noCache(NextResponse.json({ authenticated: false }));
    }

    const db = getDb();
    const user = (await db
      .prepare(`select id, email, name from users where id = ?`)
      .get(auth.userId)) as { id: string; email: string | null; name: string } | undefined;
    const household = (await db
      .prepare(`select id, name from households where id = ?`)
      .get(auth.householdId)) as { id: string; name: string } | undefined;

    // Every household this person can act in, so the UI can offer a switcher.
    // Cross-household by definition, and scoped to the caller's own memberships.
    const households = (await suspendTenant(() =>
      db
        .prepare(
          `select m.household_id, m.role, h.name
             from memberships m
             join households h on h.id = m.household_id
            where m.user_id = ?
            order by m.joined_at asc`,
        )
        .all(auth.userId),
    )) as { household_id: string; role: string; name: string }[];

    return noCache(
      NextResponse.json({
        authenticated: true,
        user: {
          id: auth.userId,
          email: user?.email ?? null,
          name: user?.name ?? "",
          role: auth.role,
        },
        householdId: auth.householdId,
        householdName: household?.name ?? null,
        role: auth.role,
        membershipId: auth.membershipId,
        kind: auth.kind,
        households: households.map((row) => ({ id: row.household_id, name: row.name, role: row.role })),
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Auth/me GET failed");
    return NextResponse.json({ error: "Failed to get auth status" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
