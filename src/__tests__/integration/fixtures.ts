import { getDb } from "@/db";
import { TestHarness } from "./harness";

/** Sign in and return the identity + household the app created for that account. */
export async function signInAndGetHousehold(harness: TestHarness, email = "admin@choretle.dev") {
  const signIn = await harness.signIn(email);
  const me = await harness.invokeHandler("/api/auth/me", "GET");
  if (!me.body?.user?.id || !me.body?.householdId) {
    throw new Error(`signInAndGetHousehold(${email}) got no identity: ${JSON.stringify(me.body)}`);
  }
  return {
    signIn,
    userId: me.body.user.id as string,
    householdId: me.body.householdId as string,
  };
}

/** A list is not creatable through the API (only generation makes them), so seed one. */
export async function createListFixture(householdId: string, startDate = new Date()): Promise<string> {
  const db = getDb();
  const id = `list-fixture-${crypto.randomUUID()}`;
  await db
    .prepare(
      `insert into lists (id, slate_id, household_id, name, start_date, end_date, period, status, created_at)
       values (?, ?, ?, 'Fixture list', ?, NULL, 'day', 'active', ?)`,
    )
    .run(
      id,
      `slate-fixture-${crypto.randomUUID()}`,
      householdId,
      startDate.toISOString(),
      new Date().toISOString(),
    );
  return id;
}

/**
 * Add a member to an existing household (bypassing signup, which creates a new
 * household). Creates the person and their membership row.
 */
export async function addHouseholdMember(
  householdId: string,
  role: "parent" | "child" | "helper" = "child",
  name = "Second Member",
): Promise<string> {
  const db = getDb();
  const id = `dev-user-${crypto.randomUUID()}`;
  const now = new Date().toISOString();
  await db
    .prepare(`insert into users (id, email, name, created_at, updated_at) values (?, ?, ?, ?, ?)`)
    .run(id, `${id}@choretle.dev`, name, now, now);
  await db
    .prepare(`insert into memberships (id, household_id, user_id, role, points_total) values (?, ?, ?, ?, 0)`)
    .run(`mem-${crypto.randomUUID()}`, householdId, id, role);
  return id;
}

/** An account that exists but has not joined any household (signup always creates one). */
export async function addUserWithoutHousehold(
  id: string,
  email: string,
  role: "parent" | "child" = "parent",
): Promise<string> {
  const now = new Date().toISOString();
  await getDb()
    .prepare(`insert into users (id, email, name, created_at, updated_at) values (?, ?, ?, ?, ?)`)
    .run(id, email, id, now, now);
  return id;
}

/** Add a child to the household and return a harness signed in as them. */
export async function signInAsChild(
  householdId: string,
  name = "Child Member",
): Promise<{ harness: TestHarness; childId: string }> {
  const childId = await addHouseholdMember(householdId, "child", name);
  const row = (await getDb().prepare(`select email from users where id = ?`).get(childId)) as {
    email: string;
  };
  const harness = new TestHarness();
  const res = await harness.invokeHandler("/api/auth/signin", "POST", {
    email: row.email,
    password: "test",
  });
  if (res.status !== 200 || res.body?.role !== "child") {
    throw new Error(`signInAsChild failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return { harness, childId };
}
