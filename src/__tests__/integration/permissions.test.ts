import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";
import { signInAndGetFamily, signInAsChild, createListFixture } from "./fixtures";

type Method = "GET" | "POST" | "PUT" | "DELETE";

/** Every admin write the API exposes. Children must get 403 on all of them. */
const ADMIN_WRITES: Array<[Method, string, Record<string, string>?]> = [
  ["POST", "/api/tasks"],
  ["PUT", "/api/tasks"],
  ["DELETE", "/api/tasks"],
  ["PUT", "/api/tasks/[taskId]", { taskId: "missing-id" }],
  ["DELETE", "/api/tasks/[taskId]", { taskId: "missing-id" }],
  ["POST", "/api/tasks/subtasks"],
  ["PUT", "/api/tasks/subtasks"],
  ["DELETE", "/api/tasks/subtasks"],
  ["DELETE", "/api/tasks/subtasks/[subtaskId]", { subtaskId: "missing-id" }],
  ["POST", "/api/slates"],
  ["PUT", "/api/slates/[slateId]", { slateId: "missing-id" }],
  ["DELETE", "/api/slates/[slateId]", { slateId: "missing-id" }],
  ["PUT", "/api/slates/[slateId]/tags", { slateId: "missing-id" }],
  ["PUT", "/api/slates/[slateId]/tasks", { slateId: "missing-id" }],
  ["POST", "/api/rotations"],
  ["PUT", "/api/rotations"],
  ["DELETE", "/api/rotations"],
  ["DELETE", "/api/rotations/[rotationId]", { rotationId: "missing-id" }],
  ["POST", "/api/schedules/generate"],
  ["POST", "/api/tags"],
  ["PUT", "/api/tags"],
  ["DELETE", "/api/tags"],
  ["POST", "/api/teams"],
  ["PUT", "/api/teams"],
  ["DELETE", "/api/teams"],
  ["POST", "/api/family/[familyId]/teams", { familyId: "own-family" }],
  ["POST", "/api/family/[familyId]/teams/[teamId]/members", { familyId: "own-family", teamId: "missing-id" }],
  ["DELETE", "/api/family/[familyId]/teams/[teamId]/members", { familyId: "own-family", teamId: "missing-id" }],
];

/** Reads a child is allowed to make (the chore UI depends on them). */
const CHILD_READS: Array<[string, Record<string, string>?]> = [
  ["/api/tasks"],
  ["/api/tasks/[taskId]", { taskId: "missing-id" }],
  ["/api/tasks/subtasks"],
  ["/api/slates"],
  ["/api/slates/[slateId]", { slateId: "missing-id" }],
  ["/api/slates/[slateId]/tasks", { slateId: "missing-id" }],
  ["/api/rotations"],
  ["/api/jobs/kanban"],
  ["/api/medals"],
];

async function parentAndChild() {
  const parent = new TestHarness();
  const { familyId } = await signInAndGetFamily(parent);
  const { harness: child, childId } = await signInAsChild(familyId);
  return { parent, child, familyId, childId };
}

describe("Role permissions", () => {
  beforeEach(() => {
    resetDb();
  });

  it("blocks a child from every admin write", async () => {
    const { child, familyId } = await parentAndChild();

    const wrong: string[] = [];
    for (const [method, path, params] of ADMIN_WRITES) {
      const resolved = params
        ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v === "own-family" ? familyId : v]))
        : undefined;
      const res = await child.invokeHandler(path, method, method === "GET" ? undefined : {}, resolved);
      if (res.status !== 403 || !/Parent access required/.test(res.body?.error || "")) {
        wrong.push(`${method} ${path} -> ${res.status} ${JSON.stringify(res.body)}`);
      }
    }

    expect(wrong).toEqual([]);
  });

  it("does not block a parent from the same endpoints", async () => {
    const { parent, familyId } = await parentAndChild();

    // Fake ids make these 400/404; the point is that none of them is a 403.
    const wrong: string[] = [];
    for (const [method, path, params] of ADMIN_WRITES) {
      const resolved = params
        ? Object.fromEntries(Object.entries(params).map(([k, v]) => [k, v === "own-family" ? familyId : v]))
        : undefined;
      const res = await parent.invokeHandler(path, method, method === "GET" ? undefined : {}, resolved);
      if (res.status === 403) wrong.push(`${method} ${path} -> 403 ${JSON.stringify(res.body)}`);
    }

    expect(wrong).toEqual([]);
  });

  it("keeps the reads the chore UI needs open to a child", async () => {
    const { child } = await parentAndChild();

    const wrong: string[] = [];
    for (const [path, params] of CHILD_READS) {
      const res = await child.invokeHandler(path, "GET", undefined, params);
      if (res.status === 403 || res.status === 401) wrong.push(`GET ${path} -> ${res.status}`);
    }

    expect(wrong).toEqual([]);
  });

  it("lets a child complete a chore assigned to them", async () => {
    const { parent, child, familyId, childId } = await parentAndChild();
    const listId = createListFixture(familyId);
    const job = await parent.invokeHandler("/api/jobs", "POST", {
      listId, name: "Feed the cat", points: 5, assignedTo: childId,
    });
    expect(job.status).toBe(200);
    expect((await child.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "doing" }, { jobId: job.body.id })).status).toBe(200);

    const done = await child.invokeHandler("/api/jobs/[jobId]", "PUT", { status: "done" }, { jobId: job.body.id });

    expect(done.status).toBe(200);
    expect(done.body.job.status).toBe("done");
  });
});
