import { describe, it, expect, beforeEach } from "vitest";
import { NextRequest } from "next/server";
import { TestHarness } from "./harness";
import { resetDb, getDb } from "@/db";
import { signInAndGetHousehold, addHouseholdMember, addUserWithoutHousehold } from "./fixtures";
import { middleware } from "../../../middleware";
import { createDevSession, signDevSession } from "@/lib/dev-auth";

/** Sign in an account that exists but belongs to no household. */
async function signInWithoutHousehold(id: string): Promise<TestHarness> {
  await addUserWithoutHousehold(id, `${id}@choretle.dev`);
  const harness = new TestHarness();
  const res = await harness.invokeHandler("/api/auth/signin", "POST", { email: `${id}@choretle.dev`, password: "test" });
  expect(res.status).toBe(200);
  return harness;
}

async function createTeam(harness: TestHarness, name: string): Promise<string> {
  const res = await harness.invokeHandler("/api/teams", "POST", { name });
  expect(res.status).toBe(201);
  return res.body.id;
}

describe("Household isolation", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("ignores a householdId query param that names another household", async () => {
    const mine = new TestHarness();
    const me = await signInAndGetHousehold(mine);
    await mine.invokeHandler("/api/tasks", "POST", { name: "My Task" });

    const theirs = new TestHarness();
    const them = await signInAndGetHousehold(theirs, "other@choretle.dev");
    await theirs.invokeHandler("/api/tasks", "POST", { name: "Their Task" });
    await theirs.invokeHandler("/api/slates", "POST", { name: "Their Slate" });
    await theirs.invokeHandler("/api/tags", "POST", { name: "their-tag" });

    // Every route that used to fall back to ?householdId= must ignore it.
    const tasks = await mine.invokeHandler(`/api/tasks?householdId=${them.householdId}`, "GET");
    expect(tasks.status).toBe(200);
    expect(tasks.body.map((t: any) => t.name)).toEqual(["My Task"]);

    const slates = await mine.invokeHandler(`/api/slates?householdId=${them.householdId}`, "GET");
    expect(slates.status).toBe(200);
    expect(slates.body.map((s: any) => s.name)).toEqual([]);

    const tags = await mine.invokeHandler(`/api/tags?householdId=${them.householdId}`, "GET");
    expect(tags.status).toBe(200);
    expect(tags.body.map((t: any) => t.name)).toEqual([]);

    const rotations = await mine.invokeHandler(`/api/rotations?householdId=${them.householdId}`, "GET");
    expect(rotations.status).toBe(200);
    expect(rotations.body.household.id).toBe(me.householdId);
  });

  it("refuses read and write access to an account with no household", async () => {
    const victim = new TestHarness();
    const them = await signInAndGetHousehold(victim, "other@choretle.dev");
    await victim.invokeHandler("/api/tasks", "POST", { name: "Their Task" });
    const rawDb = getDb()!;
    const before = await rawDb.prepare(`SELECT name FROM households WHERE id = ?`).get(them.householdId);

    const ghost = await signInWithoutHousehold("ghost");

    const read = await ghost.invokeHandler(`/api/tasks?householdId=${them.householdId}`, "GET");
    expect(read.status).toBe(401);

    const lists = await ghost.invokeHandler(`/api/rotations?householdId=${them.householdId}`, "GET");
    expect(lists.status).toBe(401);

    const rename = await ghost.invokeHandler("/api/household/[householdId]", "PUT", { name: "Hijacked" }, { householdId: them.householdId });
    expect(rename.status).toBe(401);

    const remove = await ghost.invokeHandler("/api/household/[householdId]", "DELETE", undefined, { householdId: them.householdId });
    expect(remove.status).toBe(401);

    expect(await rawDb.prepare(`SELECT name FROM households WHERE id = ?`).get(them.householdId)).toEqual(before);
  });

  it("does not let a member rename a household through another household's URL", async () => {
    const mine = new TestHarness();
    const me = await signInAndGetHousehold(mine);

    const theirs = new TestHarness();
    const them = await signInAndGetHousehold(theirs, "other@choretle.dev");
    const rawDb = getDb()!;
    const before = await rawDb.prepare(`SELECT name FROM households WHERE id = ?`).get(them.householdId);

    const res = await mine.invokeHandler("/api/household/[householdId]", "PUT", { name: "Hijacked" }, { householdId: them.householdId });
    expect(res.status).toBe(403);

    expect(await rawDb.prepare(`SELECT name FROM households WHERE id = ?`).get(them.householdId)).toEqual(before);
    expect(me.householdId).not.toBe(them.householdId);
  });

  it("does not list another household's team members through a foreign team id", async () => {
    const mine = new TestHarness();
    const me = await signInAndGetHousehold(mine);
    const myTeam = await createTeam(mine, "My Team");
    const myChild = await addHouseholdMember(me.householdId, "child");
    await mine.invokeHandler(
      "/api/household/[householdId]/teams/[teamId]/members",
      "POST",
      { userId: myChild },
      { householdId: me.householdId, teamId: myTeam },
    );

    const theirs = new TestHarness();
    const them = await signInAndGetHousehold(theirs, "other@choretle.dev");
    const theirTeam = await createTeam(theirs, "Their Team");

    const res = await mine.invokeHandler(
      "/api/household/[householdId]/teams/[teamId]/members",
      "GET",
      undefined,
      { householdId: me.householdId, teamId: theirTeam },
    );
    expect(res.status).toBe(404);
    expect(JSON.stringify(res.body)).not.toContain("Second Member");
  });

  it("rejects assigning a job to a member of another household", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);
    const created = await mine.invokeHandler("/api/jobs", "POST", { name: "Sweep", points: 10 });
    expect(created.status).toBe(200);

    const theirs = new TestHarness();
    const them = await signInAndGetHousehold(theirs, "other@choretle.dev");
    const foreignChild = await addHouseholdMember(them.householdId, "child");

    const res = await mine.invokeHandler(
      "/api/jobs/[jobId]",
      "PUT",
      { status: "doing", assignedTo: foreignChild },
      { jobId: created.body.id },
    );
    expect(res.status).toBe(404);

    const job = await getDb()!.prepare(`SELECT assigned_to FROM jobs WHERE id = ?`).get(created.body.id) as any;
    expect(job.assigned_to).toBeNull();
  });

  it("rejects attaching a job to another household's slate task", async () => {
    const theirs = new TestHarness();
    await signInAndGetHousehold(theirs, "other@choretle.dev");
    const theirTask = await theirs.invokeHandler("/api/tasks", "POST", { name: "Their Secret Task" });
    const theirSlate = await theirs.invokeHandler("/api/slates", "POST", { name: "Their Slate" });
    await theirs.invokeHandler(
      "/api/slates/[slateId]/tasks",
      "PUT",
      { explicitTaskIds: [theirTask.body.id] },
      { slateId: theirSlate.body.id },
    );
    const theirSlateTask = await getDb()!.prepare(`SELECT id FROM slate_tasks WHERE slate_id = ?`).get(theirSlate.body.id) as any;

    const mine = new TestHarness();
    await signInAndGetHousehold(mine);
    const res = await mine.invokeHandler("/api/jobs", "POST", { name: "Peek", slateTaskId: theirSlateTask.id });
    expect(res.status).toBe(400);
    expect(JSON.stringify(res.body)).not.toContain("Their Secret Task");
  });

  it("rejects tagging one of its tasks with another household's tag", async () => {
    const mine = new TestHarness();
    await signInAndGetHousehold(mine);

    const theirs = new TestHarness();
    await signInAndGetHousehold(theirs, "other@choretle.dev");
    const theirTag = await theirs.invokeHandler("/api/tags", "POST", { name: "their-tag" });

    const create = await mine.invokeHandler("/api/tasks", "POST", { name: "My Task", tagIds: [theirTag.body.id] });
    expect(create.status).toBe(404);

    const task = await mine.invokeHandler("/api/tasks", "POST", { name: "My Task" });
    const update = await mine.invokeHandler("/api/tasks/[taskId]", "PUT", { tagIds: [theirTag.body.id] }, { taskId: task.body.id });
    expect(update.status).toBe(404);
  });
});

describe("Identity headers", () => {
  it("strips client-supplied identity headers before a public route runs", async () => {
    const request = new NextRequest("http://localhost/api/auth/signout", {
      method: "POST",
      headers: { "x-user-id": "victim", "x-household-id": "victim-household", "x-role": "parent" },
    });

    const response = await middleware(request);
    const overrides = (response.headers.get("x-middleware-override-headers") || "").toLowerCase();

    expect(response.headers.get("x-middleware-test")).toBe("running");
    expect(overrides).not.toContain("x-user-id");
    expect(overrides).not.toContain("x-household-id");
    expect(overrides).not.toContain("x-role");
  });

  it("still passes the session identity to protected routes", async () => {
    const cookie = await signDevSession(createDevSession());
    const request = new NextRequest("http://localhost/api/tasks", {
      headers: { cookie: `dev-session=${cookie}` },
    });

    const response = await middleware(request);
    const overrides = (response.headers.get("x-middleware-override-headers") || "").toLowerCase();

    expect(overrides).toContain("x-user-id");
  });

  it("treats invite-code endpoints as authenticated, not public", async () => {
    const cookie = await signDevSession(createDevSession());
    const request = new NextRequest("http://localhost/api/household/join/generate-code", {
      method: "POST",
      headers: { cookie: `dev-session=${cookie}`, "x-user-id": "victim" },
    });

    const response = await middleware(request);
    const overrides = (response.headers.get("x-middleware-override-headers") || "").toLowerCase();

    // Session user wins; the forged header is replaced, not honoured.
    expect(response.headers.get("x-middleware-test")).toBe("running");
    expect(response.headers.get("x-middleware-request-x-user-id")).not.toBe("victim");
    expect(overrides).toContain("x-user-id");
  });
});
