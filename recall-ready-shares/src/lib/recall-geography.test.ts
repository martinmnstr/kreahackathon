import { describe, expect, it } from "vitest";
import { recallsForState, stateRecallCounts } from "./recall-geography";

describe("recall geography", () => {
  it("counts nationwide FDA recalls in each state without double counting listed states", () => {
    const counts = stateRecallCounts([{ id: "FDA-1", states: ["CA"], nationwide: true }]);
    expect(counts["CA"]).toBe(1);
    expect(counts["NY"]).toBe(1);
    expect(counts["AK"]).toBe(1);
  });
  it("counts only affected states and ignores duplicate notices and unknown states", () => {
    const recall = { id: "FDA-2", states: ["CA", "CA", "NY", "XX"], nationwide: false };
    const counts = stateRecallCounts([recall, recall]);
    expect(counts["CA"]).toBe(1);
    expect(counts["NY"]).toBe(1);
    expect(counts["TX"]).toBe(0);
    expect(counts["XX"]).toBeUndefined();
  });
  it("state selection includes nationwide recalls and excludes other states", () => {
    const recalls = [
      { id: "FDA-CA", states: ["CA"], nationwide: false },
      { id: "FDA-NY", states: ["NY"], nationwide: false },
      { id: "FDA-US", states: [], nationwide: true },
    ];
    expect(recallsForState(recalls, "CA").map((r) => r.id)).toEqual(["FDA-CA", "FDA-US"]);
    expect(recallsForState(recalls, "ALL")).toHaveLength(3);
  });
});