import { withTenant } from "@/lib/with-tenant";
import { NextRequest, NextResponse } from "next/server";
import { canAuthor, verifyAuth } from "@/lib/auth";
import { getDb } from "@/db";
import { error } from "@/lib/logger.server";
import { noCache } from "@/lib/http";

/** Parent only: every live session in this household, for the revoke list. */
async function GET(request: NextRequest) {
  try {
    const auth = await verifyAuth(request);
    if (!auth) return NextResponse.json({ error: "Authentication required" }, { status: 401 });
    if (!canAuthor(auth)) return NextResponse.json({ error: "Parent access required" }, { status: 403 });

    const devices = (await getDb()
      .prepare(
        `select s.id, s.kind, s.mode, s.device_label, s.created_at, s.last_seen_at, u.name as user_name
           from sessions s
           left join memberships m on m.id = s.membership_id
           left join users u on u.id = m.user_id
          where s.household_id = ? and s.revoked_at is null
          order by s.last_seen_at desc`,
      )
      .all(auth.householdId)) as {
      id: string;
      kind: string;
      mode: string;
      device_label: string | null;
      created_at: string;
      last_seen_at: string;
      user_name: string | null;
    }[];

    return noCache(
      NextResponse.json({
        devices: devices.map((device) => ({
          id: device.id,
          kind: device.kind,
          mode: device.mode,
          label: device.device_label,
          userName: device.user_name,
          createdAt: device.created_at,
          lastSeenAt: device.last_seen_at,
        })),
      }),
    );
  } catch (err) {
    error({ err: String(err), stack: (err as Error).stack }, "Devices GET failed");
    return NextResponse.json({ error: "Failed to list devices" }, { status: 500 });
  }
}

const GET_impl = withTenant(GET);
export { GET_impl as GET };
