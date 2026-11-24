import { getRawDb } from "@/db/drizzle";
import { TestHarness } from "./harness";

/** Sign in and return the identity + family the app created for that account. */
export async function signInAndGetFamily(harness: TestHarness, email = "admin@choretle.dev") {
  const signIn = await harness.signIn(email);
  const me = await harness.invokeHandler("/api/auth/me", "GET");
  if (!me.body?.user?.id || !me.body?.familyId) {
    throw new Error(`signInAndGetFamily(${email}) got no identity: ${JSON.stringify(me.body)}`);
  }
  return {
    signIn,
    userId: me.body.user.id as string,
    familyId: me.body.familyId as string,
  };
}

/** A list is not creatable through the API (only generation makes them), so seed one. */
export function createListFixture(familyId: string, startDate = new Date()): string {
  const rawDb = getRawDb()!;
  const id = `list-fixture-${crypto.randomUUID()}`;
  // Unique slate id: (slate_id, start_date) is a unique index, so two fixtures
  // for the same day would otherwise collide.
  rawDb.prepare(
    `INSERT INTO lists (id, slate_id, family_id, name, start_date, end_date, period, status, created_at)
     VALUES (?, ?, ?, 'Fixture list', ?, NULL, 'day', 'active', ?)`
  ).run(id, `slate-fixture-${crypto.randomUUID()}`, familyId, startDate.toISOString(), new Date().toISOString());
  return id;
}

/** Add a second member to an existing family (bypassing signup, which creates a new family). */
export function addFamilyMember(familyId: string, role: "parent" | "child" = "child"): string {
  const rawDb = getRawDb()!;
  const id = `dev-user-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  rawDb.prepare(
    `INSERT INTO users (id, email, name, role, family_id, points_total, created_at, updated_at)
     VALUES (?, ?, 'Second Member', ?, ?, 0, ?, ?)`
  ).run(id, `${id}@choretle.dev`, role, familyId, now, now);
  return id;
}

/** An account that exists but has not joined any family (signup always creates one). */
export function addUserWithoutFamily(id: string, email: string, role: "parent" | "child" = "parent"): string {
  const rawDb = getRawDb()!;
  const now = new Date().toISOString();
  rawDb.prepare(
    `INSERT INTO users (id, email, name, role, family_id, points_total, created_at, updated_at)
     VALUES (?, ?, ?, ?, NULL, 0, ?, ?)`
  ).run(id, email, id, role, now, now);
  return id;
}

/** Add a child to the family and return a harness signed in as them. */
export async function signInAsChild(familyId: string): Promise<{ harness: TestHarness; childId: string }> {
  const childId = addFamilyMember(familyId, "child");
  const row = getRawDb()!.prepare(`SELECT email FROM users WHERE id = ?`).get(childId) as any;
  const harness = new TestHarness();
  const res = await harness.invokeHandler("/api/auth/signin", "POST", { email: row.email, password: "test" });
  if (res.status !== 200 || res.body?.role !== "child") {
    throw new Error(`signInAsChild failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { harness, childId };
}
