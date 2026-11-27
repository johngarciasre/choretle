import { beforeEach, describe, expect, it } from "vitest";
import { getDb, resetDb } from "@/db";
import { runWithTenant } from "@/db/tenant";

/**
 * These tests bypass the routes on purpose: they call the database directly with
 * no household filter, so the only thing that can keep two households apart is
 * row-level security. If the policies or the role switch disappear, they fail.
 */

async function seedHousehold(id: string, taskName: string) {
  const db = getDb();
  await db.prepare(`insert into households (id, name, slug) values (?, ?, ?)`).run(id, id, id);
  await db
    .prepare(`insert into users (id, email, name) values (?, ?, ?)`)
    .run(`u-${id}`, `${id}@rls.test`, id);
  await db
    .prepare(
      `insert into memberships (id, household_id, user_id, role, points_total) values (?, ?, ?, 'parent', 0)`,
    )
    .run(`m-${id}`, id, `u-${id}`);
  await db
    .prepare(
      `insert into tasks (id, household_id, name, points, archtype, is_active, verify_required) values (?, ?, ?, 5, 'job', 1, 0)`,
    )
    .run(`t-${id}`, id, taskName);
  await db
    .prepare(
      `insert into lists (id, slate_id, household_id, name, start_date, period, status) values (?, ?, ?, 'L', now(), 'day', 'active')`,
    )
    .run(`l-${id}`, `s-${id}`, id);
  await db
    .prepare(`insert into jobs (id, list_id, name, points, status) values (?, ?, ?, 5, 'todo')`)
    .run(`j-${id}`, `l-${id}`, taskName);
}

describe("Row-level security", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("has RLS enabled on the tenant tables and a non-bypassing app role", async () => {
    const tables = (await getDb()
      .prepare(
        `select relname from pg_class
          where relrowsecurity
            and relname in ('households','memberships','tasks','lists','jobs','users')
          order by relname`,
      )
      .all()) as { relname: string }[];
    expect(tables.map((row) => row.relname)).toEqual([
      "households",
      "jobs",
      "lists",
      "memberships",
      "tasks",
      "users",
    ]);

    const role = (await getDb()
      .prepare(`select rolsuper, rolbypassrls from pg_roles where rolname = 'choretle_app'`)
      .get()) as { rolsuper: boolean; rolbypassrls: boolean };
    expect(role).toMatchObject({ rolsuper: false, rolbypassrls: false });
  });

  it("filters an unfiltered read down to the active household", async () => {
    await seedHousehold("hh-a", "A dishes");
    await seedHousehold("hh-b", "B dishes");

    // The owner sees both rows; this is what a missing WHERE clause would return.
    const asOwner = (await getDb().prepare(`select id from tasks order by id`).all()) as { id: string }[];
    expect(asOwner.map((row) => row.id)).toEqual(["t-hh-a", "t-hh-b"]);

    const tasks = (await runWithTenant("hh-a", () =>
      getDb().prepare(`select id from tasks order by id`).all(),
    )) as { id: string }[];
    expect(tasks.map((row) => row.id)).toEqual(["t-hh-a"]);

    // Child tables follow their parent through the policy's EXISTS clause.
    const jobs = (await runWithTenant("hh-a", () =>
      getDb().prepare(`select id from jobs order by id`).all(),
    )) as { id: string }[];
    expect(jobs.map((row) => row.id)).toEqual(["j-hh-a"]);

    // Identity rows are limited to people who belong to this household.
    const users = (await runWithTenant("hh-a", () =>
      getDb().prepare(`select id from users order by id`).all(),
    )) as { id: string }[];
    expect(users.map((row) => row.id)).toEqual(["u-hh-a"]);
  });

  it("refuses to insert a row belonging to another household", async () => {
    await seedHousehold("hh-a", "A");
    await seedHousehold("hh-b", "B");

    await expect(
      runWithTenant("hh-a", () =>
        getDb()
          .prepare(
            `insert into tasks (id, household_id, name, points, archtype, is_active, verify_required)
             values ('t-evil', 'hh-b', 'evil', 1, 'job', 1, 0)`,
          )
          .run(),
      ),
    ).rejects.toThrow(/row-level security/);
  });

  it("cannot update or delete another household's row", async () => {
    await seedHousehold("hh-a", "A");
    await seedHousehold("hh-b", "B");

    const updated = await runWithTenant("hh-a", () =>
      getDb().prepare(`update tasks set name = 'pwned' where id = 't-hh-b'`).run(),
    );
    expect(updated.rowCount).toBe(0);

    const deleted = await runWithTenant("hh-a", () =>
      getDb().prepare(`delete from tasks where id = 't-hh-b'`).run(),
    );
    expect(deleted.rowCount).toBe(0);

    const row = (await getDb().prepare(`select name from tasks where id = 't-hh-b'`).get()) as {
      name: string;
    };
    expect(row.name).toBe("B");
  });

  it("sees nothing when the scope names a household with no data", async () => {
    await seedHousehold("hh-a", "A");

    const tasks = await runWithTenant("hh-nobody", () =>
      getDb().prepare(`select id from tasks`).all(),
    );
    expect(tasks).toEqual([]);
  });

  it("lets a route's owner-scoped escape read across households on purpose", async () => {
    await seedHousehold("hh-a", "A");
    await seedHousehold("hh-b", "B");

    // What /api/auth/me, the household switcher and linked reports rely on.
    const all = await runWithTenant("hh-a", async () => {
      const { suspendTenant } = await import("@/db/tenant");
      return suspendTenant(() => getDb().prepare(`select id from households order by id`).all());
    });
    expect((all as { id: string }[]).map((row) => row.id)).toEqual(["hh-a", "hh-b"]);
  });
});
