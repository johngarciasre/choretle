import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./harness";
import { resetDb } from "@/db/drizzle";
import { signInAndGetFamily, signInAsChild } from "./fixtures";

async function createTeam(harness: TestHarness, name: string) {
  const res = await harness.invokeHandler("/api/teams", "POST", { name });
  expect(res.status).toBe(201);
  return res.body;
}

async function listTeams(harness: TestHarness): Promise<any[]> {
  const res = await harness.invokeHandler("/api/teams", "GET");
  expect(res.status).toBe(200);
  return res.body.teams;
}

describe("Teams API", () => {
  beforeEach(() => {
    resetDb();
  });

  it("creates a team in the caller's family and lists it with members", async () => {
    const harness = new TestHarness();
    const { familyId } = await signInAndGetFamily(harness);

    const team = await createTeam(harness, "Chores Team");
    expect(team).toMatchObject({ name: "Chores Team", family_id: familyId });

    const teams = await listTeams(harness);
    expect(teams.map((t) => t.name)).toEqual(["Chores Team"]);
    expect(teams[0].members).toEqual([]);
  });

  it("rejects a missing name", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);

    const res = await harness.invokeHandler("/api/teams", "POST", {});

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/name/);
  });

  it("renames and deletes a team", async () => {
    const harness = new TestHarness();
    await signInAndGetFamily(harness);
    const team = await createTeam(harness, "Team A");

    const renamed = await harness.invokeHandler("/api/teams", "PUT", { id: team.id, name: "Team B" });
    expect(renamed.status).toBe(200);
    expect(renamed.body.name).toBe("Team B");
    expect((await listTeams(harness))[0].name).toBe("Team B");

    const deleted = await harness.invokeHandler("/api/teams", "DELETE", { id: team.id });
    expect(deleted.status).toBe(200);
    expect(await listTeams(harness)).toHaveLength(0);
  });

  it("children cannot create, manage or assign teams but can read them", async () => {
    const parent = new TestHarness();
    const { familyId } = await signInAndGetFamily(parent);
    const team = await createTeam(parent, "Adults Only");
    const { harness: child, childId } = await signInAsChild(familyId);

    const create = await child.invokeHandler("/api/teams", "POST", { name: "Kid Team" });
    expect(create.status).toBe(403);

    const rename = await child.invokeHandler("/api/teams", "PUT", { id: team.id, name: "Renamed" });
    expect(rename.status).toBe(403);

    const remove = await child.invokeHandler("/api/teams", "DELETE", { id: team.id });
    expect(remove.status).toBe(403);

    const nestedCreate = await child.invokeHandler(
      "/api/family/[familyId]/teams", "POST", { name: "Nested" }, { familyId },
    );
    expect(nestedCreate.status).toBe(403);

    const addSelf = await child.invokeHandler(
      "/api/family/[familyId]/teams/[teamId]/members", "POST", { userId: childId }, { familyId, teamId: team.id },
    );
    expect(addSelf.status).toBe(403);

    const removeSelf = await child.invokeHandler(
      "/api/family/[familyId]/teams/[teamId]/members", "DELETE", { userId: childId }, { familyId, teamId: team.id },
    );
    expect(removeSelf.status).toBe(403);

    expect((await listTeams(parent)).map((t) => t.name)).toEqual(["Adults Only"]);
    const read = await child.invokeHandler("/api/teams", "GET");
    expect(read.status).toBe(200);
  });

  it("keeps teams inside their family", async () => {
    const mine = new TestHarness();
    await signInAndGetFamily(mine);
    const mineTeam = await createTeam(mine, "Mine");

    const other = new TestHarness();
    await signInAndGetFamily(other, "other@choretle.dev");
    await createTeam(other, "Theirs");

    expect((await listTeams(mine)).map((t) => t.name)).toEqual(["Mine"]);

    const rename = await mine.invokeHandler("/api/teams", "PUT", { id: mineTeam.id, name: "Stolen" });
    expect(rename.status).toBe(200); // own team is fine
    const foreignRename = await other.invokeHandler("/api/teams", "PUT", { id: mineTeam.id, name: "Hijacked" });
    expect(foreignRename.status).toBe(404);
    const foreignDelete = await other.invokeHandler("/api/teams", "DELETE", { id: mineTeam.id });
    expect(foreignDelete.status).toBe(404);
    expect((await listTeams(mine))[0].name).toBe("Stolen");
  });
});
