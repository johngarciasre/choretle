import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb, getRawDb } from "@/db/drizzle";
import { signInAndGetFamily, createListFixture } from "./fixtures";

async function inviteFrom(harness: TestHarness): Promise<string> {
  const res = await harness.invokeHandler("/api/family/join/generate-code", "POST", {});
  expect(res.status).toBe(200);
  return res.body.invite.code;
}

function pointsOf(userId: string): number {
  const row = getRawDb()!.prepare(`SELECT points_total FROM users WHERE id = ?`).get(userId) as any;
  return row?.points_total ?? 0;
}

/** Parent family + invite code + a kid who signed up with it + a chore for that kid. */
async function setupKidWithChore() {
  const parent = new TestHarness();
  const { familyId } = await signInAndGetFamily(parent);
  const code = await inviteFrom(parent);

  const kid = new TestHarness();
  const signup = await kid.invokeHandler("/api/auth/signup", "POST", {
    email: "kid@choretle.dev",
    password: "pw",
    name: "Robin",
    inviteCode: code,
  });
  expect(signup.status).toBe(200);
  const kidId = signup.body.userId as string;

  const listId = createListFixture(familyId);
  const created = await parent.invokeHandler("/api/jobs", "POST", {
    listId,
    name: "Feed the cat",
    points: 5,
    assignedTo: kidId,
  });
  expect(created.status).toBe(200);

  return { parent, kid, familyId, kidId, jobId: created.body.id as string, code };
}

describe("Kid flow", () => {
  beforeEach(() => {
    resetDb();
  });

  it("an invite code signs a new kid into the parent's family as a child", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const code = await inviteFrom(parent);

    const kid = new TestHarness();
    const signup = await kid.invokeHandler("/api/auth/signup", "POST", {
      email: "kid@choretle.dev",
      password: "pw",
      name: "Robin",
      inviteCode: code,
    });

    expect(signup.status).toBe(200);
    expect(signup.body.role).toBe("child");
    expect(signup.body.familyId).toBe(familyId);

    const me = await kid.invokeHandler("/api/auth/me", "GET");
    expect(me.body.user.role).toBe("child");
    expect(me.body.familyId).toBe(familyId);

    // The code is single use.
    const second = await new TestHarness().invokeHandler("/api/auth/signup", "POST", {
      email: "kid2@choretle.dev",
      password: "pw",
      name: "Sam",
      inviteCode: code,
    });
    expect(second.status).toBe(400);
  });

  it("rejects an unknown family code", async () => {
    const res = await new TestHarness().invokeHandler("/api/auth/signup", "POST", {
      email: "kid@choretle.dev",
      password: "pw",
      name: "Robin",
      inviteCode: "made-up-code",
    });
    expect(res.status).toBe(400);
    expect(getRawDb()!.prepare(`SELECT COUNT(*) as n FROM users`).get()).toEqual({ n: 0 });
  });

  it("an invited kid can read the chore detail, start it, and get paid once on done", async () => {
    const { kid, kidId, jobId } = await setupKidWithChore();

    const board = await kid.invokeHandler("/api/jobs/kanban", "GET");
    expect(board.status).toBe(200);
    expect(board.body.jobs.map((j: any) => j.id)).toContain(jobId);

    // The detail page contract: flat job fields plus comments and jobHistory.
    const detail = await kid.invokeHandler("/api/jobs/[jobId]", "GET", undefined, { jobId });
    expect(detail.status).toBe(200);
    expect(detail.body.name).toBe("Feed the cat");
    expect(detail.body.verifyRequired).toBe(false);
    expect(detail.body.reviewedAt).toBeNull();
    expect(Array.isArray(detail.body.comments)).toBe(true);
    expect(Array.isArray(detail.body.jobHistory)).toBe(true);

    expect((await kid.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId })).status).toBe(200);
    const done = await kid.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId });
    expect(done.status).toBe(200);
    expect(done.body.job.status).toBe("done");
    expect(pointsOf(kidId)).toBe(5);
  });

  it("a chore needing review can only be closed by a parent", async () => {
    const { parent, kid, kidId, jobId } = await setupKidWithChore();
    getRawDb()!.prepare(`UPDATE jobs SET verify_required = 1 WHERE id = ?`).run(jobId);

    await kid.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId });
    const kidDone = await kid.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId });
    expect(kidDone.status).toBe(403);
    expect(pointsOf(kidId)).toBe(0);

    const submitted = await kid.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "under_review" }, { jobId });
    expect(submitted.status).toBe(200);

    const approved = await parent.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId });
    expect(approved.status).toBe(200);
    expect(approved.body.job.reviewedAt).toBeTruthy();
    expect(pointsOf(kidId)).toBe(5);
  });
});
