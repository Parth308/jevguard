import { describe, expect, it } from "vitest";
import { JevGuard, type SystemOneClient } from "../src/guard.js";

function stubClient(): SystemOneClient {
  return {
    async systemOne() {
      return {
        model: "jev-latest",
        answers: {
          jailbreak: { type: "noul", noul: 0.02 },
          refusal: { type: "noul", noul: 0.05 },
          harm: {
            type: "score",
            score: 0,
            confidence: 0.95,
            legend: { 0: "Low", 1: "Medium", 2: "High" },
            probabilities: { 0: 0.95, 1: 0.04, 2: 0.01 }
          },
          uncertainty: {
            type: "score",
            score: 0,
            confidence: 0.9,
            legend: { 0: "Low", 1: "Medium", 2: "High" },
            probabilities: { 0: 0.9, 1: 0.09, 2: 0.01 }
          }
        },
        usage: { input_tokens: 10, output_tokens: 5 }
      } as any;
    }
  };
}

describe("smoke", () => {
  it("guards a benign response as pass without any network call", async () => {
    const guard = new JevGuard(stubClient());
    const verdict = await guard.analyze({ response: "Hello! How can I help?" });
    expect(verdict.verdict).toBe("pass");
    expect(verdict.findings).toEqual([]);
  });
});
