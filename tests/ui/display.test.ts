import { initials, colorForId } from "@/lib/ui/display";

describe("initials", () => {
  it("takes first letters of first two words, uppercased", () => {
    expect(initials("Elena Hart")).toBe("EH");
  });
  it("handles a single word", () => {
    expect(initials("Reading")).toBe("RE");
  });
  it("handles empty/falsy", () => {
    expect(initials("")).toBe("?");
  });
});

describe("colorForId", () => {
  it("is deterministic for the same id", () => {
    expect(colorForId("abc")).toBe(colorForId("abc"));
  });
  it("returns an oklch string from the palette", () => {
    expect(colorForId("abc")).toMatch(/^oklch\(/);
  });
});
