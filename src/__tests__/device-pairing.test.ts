import { describe, it, expect, beforeEach } from "vitest";
import { TestHarness } from "./integration/harness";
import { signInAndGetHousehold, signInAsChild } from "./integration/fixtures";
import { resetDb } from "@/db";

/**
 * Pairing a device nobody can type into: the device asks, a signed-in parent
 * approves from their phone, and only then does an enrollment code exist.
 */
describe("device pairing", () => {
  beforeEach(async () => {
    await resetDb();
  });

  it("needs a parent's approval before the code does anything", async () => {
    const tablet = new TestHarness();
    const request = await tablet.invokeHandler("/api/auth/enroll/pair", "POST");
    expect(request.status).toBe(200);
    const code = request.body.code as string;
    expect(typeof code).toBe("string");

    // Unapproved: the waiting device must see "not yet" (404), not a session.
    const early = await tablet.invokeHandler("/api/auth/enroll/consume", "POST", { code, label: "Wall Tablet" });
    expect(early.status).toBe(404);
    expect(early.body.reason).toBe("unknown");

    // An anonymous phone cannot approve either.
    const anonymous = new TestHarness();
    const noAuth = await anonymous.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code });
    expect(noAuth.status).toBe(401);
    const stillWaiting = await tablet.invokeHandler("/api/auth/enroll/consume", "POST", { code });
    expect(stillWaiting.status).toBe(404);

    // A child in the household is not a grown-up.
    const parent = new TestHarness();
    const { householdId } = await signInAndGetHousehold(parent, "pairing-parent@choretle.dev");
    const { harness: child } = await signInAsChild(householdId, "Pairing Child");
    const childApproval = await child.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code });
    expect(childApproval.status).toBe(403);

    // The parent's approval is what mints the enrollment code.
    const approved = await parent.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code });
    expect(approved.status).toBe(200);
    expect(approved.body.householdId).toBe(householdId);

    const consumed = await tablet.invokeHandler("/api/auth/enroll/consume", "POST", {
      code,
      label: "Wall Tablet",
    });
    expect(consumed.status).toBe(200);
    expect(consumed.body.kind).toBe("picker");

    // The tablet is now a household picker, not an anonymous device.
    const profiles = await tablet.invokeHandler("/api/auth/profiles", "GET");
    expect(profiles.status).toBe(200);
    expect(profiles.body.household.id).toBe(householdId);

    // And the code is single use, like any other enrollment code.
    const replay = await new TestHarness().invokeHandler("/api/auth/enroll/consume", "POST", { code });
    expect(replay.status).toBe(400);
    expect(replay.body.reason).toBe("used");
  });

  it("refuses to approve the same tablet twice", async () => {
    const tablet = new TestHarness();
    const { body } = await tablet.invokeHandler("/api/auth/enroll/pair", "POST");
    const phone = new TestHarness();
    await signInAndGetHousehold(phone, "pairing-double@choretle.dev");

    expect((await phone.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code: body.code })).status).toBe(200);
    const again = await phone.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code: body.code });
    expect(again.status).toBe(409);
  });

  it("rejects an unknown pairing code", async () => {
    const phone = new TestHarness();
    await signInAndGetHousehold(phone, "pairing-unknown@choretle.dev");
    const res = await phone.invokeHandler("/api/auth/enroll/pair/approve", "POST", { code: "not-a-real-code" });
    expect(res.status).toBe(404);
  });
});
