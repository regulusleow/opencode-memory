import { describe, it, expect } from "bun:test";
import { rrfFuse, applyPostRRFBonus } from "../src/services/search-fusion";

describe("RRF Fusion", () => {
  it("single layer, 3 results", () => {
    const result = rrfFuse([
      [
        { id: "A", rank: 1 },
        { id: "B", rank: 2 },
        { id: "C", rank: 3 },
      ],
    ]);

    expect(result.get("A")).toBeCloseTo(1 / 61, 10);
    expect(result.get("B")).toBeCloseTo(1 / 62, 10);
    expect(result.get("C")).toBeCloseTo(1 / 63, 10);
  });

  it("two layers, no overlap", () => {
    const result = rrfFuse([
      [{ id: "A", rank: 1 }],
      [{ id: "B", rank: 1 }],
    ]);

    expect(result.get("A")).toBeCloseTo(1 / 61, 10);
    expect(result.get("B")).toBeCloseTo(1 / 61, 10);
  });

  it("two layers, full overlap (same order)", () => {
    const result = rrfFuse([
      [{ id: "A", rank: 1 }],
      [{ id: "A", rank: 1 }],
    ]);

    expect(result.get("A")).toBeCloseTo(2 / 61, 10);
  });

  it("two layers, partial overlap", () => {
    const result = rrfFuse([
      [
        { id: "A", rank: 1 },
        { id: "B", rank: 2 },
      ],
      [
        { id: "B", rank: 1 },
        { id: "C", rank: 2 },
      ],
    ]);

    const scoreA = result.get("A");
    const scoreB = result.get("B");
    const scoreC = result.get("C");

    expect(scoreB).toBeGreaterThan(scoreA!);
    expect(scoreB).toBeGreaterThan(scoreC!);
  });

  it("empty layer contributes nothing", () => {
    const result = rrfFuse([[], [{ id: "A", rank: 1 }]]);

    expect(result.get("A")).toBeCloseTo(1 / 61, 10);
  });

  it("all layers empty", () => {
    const result = rrfFuse([[], []]);

    expect(result.size).toBe(0);
  });

  it("custom k value", () => {
    const result = rrfFuse([[{ id: "A", rank: 1 }]], 10);

    expect(result.get("A")).toBeCloseTo(1 / 11, 10);
  });

  it("post-RRF bonus applied", () => {
    const fusedScores = new Map([["A", 1 / 61]]);
    const bonuses = new Map([["A", 0.5]]);

    const result = applyPostRRFBonus(fusedScores, bonuses);

    expect(result.get("A")).toBeCloseTo(1 / 61 + 0.5, 10);
  });

  it("post-RRF bonus with missing id", () => {
    const fusedScores = new Map<string, number>([["A", 1 / 61]]);
    const bonuses = new Map<string, number>([]);

    const result = applyPostRRFBonus(fusedScores, bonuses);

    expect(result.get("A")).toBeCloseTo(1 / 61, 10);
  });

  it("verify overlap result precision (2/61)", () => {
    const result = rrfFuse([
      [{ id: "B", rank: 1 }],
      [{ id: "B", rank: 1 }],
    ]);

    expect(result.get("B")).toBeCloseTo(2 / 61, 10);
  });
});
