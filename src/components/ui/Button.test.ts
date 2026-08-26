import { describe, it, expect } from "vitest";
import { BUTTON_BASE_STYLES } from "@/components/ui/Button";

describe("Button component", () => {
  describe("BUTTON_BASE_STYLES", () => {
    it("should contain inline-flex for proper icon/text alignment", () => {
      expect(BUTTON_BASE_STYLES).toContain("inline-flex");
    });

    it("should contain items-center for vertical centering of icon and text", () => {
      expect(BUTTON_BASE_STYLES).toContain("items-center");
    });

    it("should contain justify-center for horizontal centering", () => {
      expect(BUTTON_BASE_STYLES).toContain("justify-center");
    });

    it("should contain rounded-full for pill shape", () => {
      expect(BUTTON_BASE_STYLES).toContain("rounded-full");
    });

    it("should contain font-bold for bold text", () => {
      expect(BUTTON_BASE_STYLES).toContain("font-bold");
    });

    it("should not be empty or missing critical layout classes", () => {
      const requiredClasses = ["inline-flex", "items-center", "rounded-full"];
      for (const cls of requiredClasses) {
        expect(BUTTON_BASE_STYLES, `${cls} missing from base styles`).toContain(cls);
      }
    });
  });
});
