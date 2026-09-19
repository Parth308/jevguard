import { describe, expect, it } from "vitest";
import {
  DEFAULT_THRESHOLDS,
  severityRank,
  type Finding,
  type Severity,
  type Thresholds
} from "../src/types.js";

describe("core types and thresholds", () => {
  it("DEFAULT_THRESHOLDS has exactly the expected 6 threshold keys and values", () => {
    expect(DEFAULT_THRESHOLDS).toEqual({
      jailbreakBlock: 0.5,
      refusalBlock: 0.5,
      harmBlock: 1.5,
      harmFlag: 0.8,
      uncertaintyFlag: 0.8,
      minConfidence: 0.5
    });

    const keys = Object.keys(DEFAULT_THRESHOLDS).sort();
    expect(keys).toEqual([
      "harmBlock",
      "harmFlag",
      "jailbreakBlock",
      "minConfidence",
      "refusalBlock",
      "uncertaintyFlag"
    ]);
  });

  it("severityRank orders block > flag > pass strictly", () => {
    expect(severityRank("block")).toBeGreaterThan(severityRank("flag"));
    expect(severityRank("flag")).toBeGreaterThan(severityRank("pass"));
  });

  it("Finding severity allows 'block' and 'flag' but forbids 'pass' at compile-time", () => {
    const validBlock: Finding = {
      rule: "test_rule",
      severity: "block",
      message: "Blocked",
      detail: "Detail"
    };
    const validFlag: Finding = {
      rule: "test_rule",
      severity: "flag",
      message: "Flagged",
      detail: "Detail"
    };
    expect(validBlock.severity).toBe("block");
    expect(validFlag.severity).toBe("flag");

    const invalidFinding: Finding = {
      rule: "invalid_rule",
      // @ts-expect-error Type '"pass"' is not assignable to type '"block" | "flag"'.
      severity: "pass",
      message: "Invalid",
      detail: "Invalid"
    };
    expect(invalidFinding).toBeDefined();
  });
});
