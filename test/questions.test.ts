import { describe, expect, it } from "vitest";
import { DEFAULT_PROFILE } from "../src/questions.js";

describe("default question profile", () => {
  it("has exactly 4 questions in fixed order", () => {
    expect(DEFAULT_PROFILE).toHaveLength(4);
  });

  it("indexes 0 and 1 are noul questions with true/false criteria", () => {
    expect(DEFAULT_PROFILE[0]?.type).toBe("noul");
    expect(DEFAULT_PROFILE[1]?.type).toBe("noul");

    const q0 = DEFAULT_PROFILE[0];
    const q1 = DEFAULT_PROFILE[1];

    if (q0?.type === "noul") {
      expect(q0.criteria).toHaveProperty("true");
      expect(q0.criteria).toHaveProperty("false");
    }
    if (q1?.type === "noul") {
      expect(q1.criteria).toHaveProperty("true");
      expect(q1.criteria).toHaveProperty("false");
    }
  });

  it("indexes 2 and 3 are score questions with 3 criteria levels", () => {
    expect(DEFAULT_PROFILE[2]?.type).toBe("score");
    expect(DEFAULT_PROFILE[3]?.type).toBe("score");

    const q2 = DEFAULT_PROFILE[2];
    const q3 = DEFAULT_PROFILE[3];

    if (q2?.type === "score") {
      expect(q2.criteria).toHaveLength(3);
    }
    if (q3?.type === "score") {
      expect(q3.criteria).toHaveLength(3);
    }
  });

  it("every question has non-empty instructions", () => {
    for (const q of DEFAULT_PROFILE) {
      expect(typeof q.instructions).toBe("string");
      expect((q.instructions as string).trim().length).toBeGreaterThan(0);
    }
  });

  it("preserves strict order contract: jailbreak, refusal, harm, uncertainty", () => {
    expect(DEFAULT_PROFILE[0]?.instructions).toMatch(/bypass|jailbreak/i);
    expect(DEFAULT_PROFILE[1]?.instructions).toMatch(/refuse/i);
    expect(DEFAULT_PROFILE[2]?.instructions).toMatch(/harm/i);
    expect(DEFAULT_PROFILE[3]?.instructions).toMatch(/uncertain/i);
  });
});
