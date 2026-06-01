import { sliceSegment } from "@/lib/annotate/highlights";

// segment "Hello world foo" starting at absolute offset 100
const seg = { offset: 100, text: "Hello world foo" };

describe("sliceSegment", () => {
  it("returns one plain part when no annotations overlap", () => {
    expect(sliceSegment(seg, [])).toEqual([{ text: "Hello world foo" }]);
  });
  it("wraps a single overlapping annotation", () => {
    // 'world' is chars 106..111 absolute
    const parts = sliceSegment(seg, [{ id: "a1", charStart: 106, charEnd: 111 }]);
    expect(parts).toEqual([
      { text: "Hello " },
      { text: "world", annId: "a1" },
      { text: " foo" },
    ]);
  });
  it("clamps an annotation that starts before the segment", () => {
    const parts = sliceSegment(seg, [{ id: "a2", charStart: 90, charEnd: 105 }]);
    expect(parts).toEqual([
      { text: "Hello", annId: "a2" },
      { text: " world foo" },
    ]);
  });
  it("handles two non-overlapping annotations in order", () => {
    const parts = sliceSegment(seg, [
      { id: "a1", charStart: 100, charEnd: 105 },
      { id: "a3", charStart: 112, charEnd: 115 },
    ]);
    expect(parts).toEqual([
      { text: "Hello", annId: "a1" },
      { text: " world ", annId: undefined },
      { text: "foo", annId: "a3" },
    ].map((p) => p.annId === undefined ? { text: p.text } : p));
  });
  it("ignores annotations entirely outside the segment", () => {
    expect(sliceSegment(seg, [{ id: "x", charStart: 200, charEnd: 210 }])).toEqual([{ text: "Hello world foo" }]);
  });
});
