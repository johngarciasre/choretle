// @vitest-environment happy-dom
import { describe, expect, it, vi } from "vitest";
import { copyText } from "@/components/HouseholdAccessPanel";

/** A tablet reaches this panel over plain http, so the Clipboard API is gone. */
function withoutClipboardApi() {
  Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
}

function withClipboardApi(writeText: (text: string) => Promise<void>) {
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
}

describe("copyText", () => {
  it("uses the Clipboard API when the page has one", async () => {
    const writeText = vi.fn(async () => {});
    withClipboardApi(writeText);

    await expect(copyText("http://tablet/enroll#abc")).resolves.toBe(true);
    expect(writeText).toHaveBeenCalledWith("http://tablet/enroll#abc");
  });

  it("falls back to a selection copy without the Clipboard API", async () => {
    withoutClipboardApi();
    const execCommand = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    await expect(copyText("http://tablet/enroll#abc")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("reports failure rather than claiming a copy", async () => {
    withoutClipboardApi();
    (document as unknown as { execCommand: unknown }).execCommand = vi.fn(() => false);

    await expect(copyText("http://tablet/enroll#abc")).resolves.toBe(false);
    expect(document.querySelector("textarea")).toBeNull();
  });

  it("falls back when the Clipboard API throws", async () => {
    withClipboardApi(async () => {
      throw new Error("denied");
    });
    const execCommand = vi.fn(() => true);
    (document as unknown as { execCommand: unknown }).execCommand = execCommand;

    await expect(copyText("http://tablet/enroll#abc")).resolves.toBe(true);
    expect(execCommand).toHaveBeenCalledWith("copy");
  });
});
