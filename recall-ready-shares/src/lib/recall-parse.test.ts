import { describe, expect, it } from "vitest";
import { classifyHazard, parseLotNumbers, parseStates, targetedHeadline } from "./recall-parse";

describe("recall parsing", () => {
  it("reads state codes and names", () => {
    expect(parseStates("CA, AZ, NJ and Texas").states).toEqual(["AZ", "CA", "NJ", "TX"]);
  });
  it("flags nationwide distribution", () => {
    expect(parseStates("Distributed nationwide").nationwide).toBe(true);
  });
  it("extracts lot numbers", () => {
    expect(parseLotNumbers("Lot #: 24A115, 24A116 and 24B001. Best by 10/2026")).toEqual(["24A115", "24A116", "24B001"]);
  });
  it("classifies listeria as bacteria", () => {
    expect(classifyHazard("Potential Listeria monocytogenes contamination")).toBe("bacteria");
  });
  it("targets a state for this week", () => {
    expect(targetedHeadline("CA", "2026-10-08", new Date("2026-10-10"))).toBe("New in California this week");
  });
});
