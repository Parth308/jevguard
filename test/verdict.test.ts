import { describe, expect, it } from "vitest";
import { evaluateAnswers, isNoulAnswer, isScoreAnswer } from "../src/verdict.js";
import { DEFAULT_THRESHOLDS, type JevAnswer } from "../src/types.js";

function makeAnswers(overrides?: {
  jailbreakNoul?: number;
  refusalNoul?: number;
  harmScore?: number;
  harmConfidence?: number;
  uncertaintyScore?: number;
  uncertaintyConfidence?: number;
}): JevAnswer[] {
  return [
    {
      type: "noul",
      noul: overrides?.jailbreakNoul ?? 0.02
    },
    {
      type: "noul",
      noul: overrides?.refusalNoul ?? 0.05
    },
    {
      type: "score",
      score: overrides?.harmScore ?? 0,
      confidence: overrides?.harmConfidence ?? 0.95,
      legend: { 0: "Low", 1: "Medium", 2: "High" } as any,
      probabilities: { 0: 0.95, 1: 0.04, 2: 0.01 } as any
    },
    {
      type: "score",
      score: overrides?.uncertaintyScore ?? 0,
      confidence: overrides?.uncertaintyConfidence ?? 0.9,
      legend: { 0: "Low", 1: "Medium", 2: "High" } as any,
      probabilities: { 0: 0.9, 1: 0.09, 2: 0.01 } as any
    }
  ];
}

describe("verdict evaluation engine", () => {
  it("type guards correctly identify noul and score answers", () => {
    const noulAns = { type: "noul", noul: 0.1 };
    const scoreAns = { type: "score", score: 1, confidence: 0.9 };
    const invalidAns = { type: "other" };

    expect(isNoulAnswer(noulAns)).toBe(true);
    expect(isNoulAnswer(scoreAns)).toBe(false);
    expect(isNoulAnswer(invalidAns)).toBe(false);

    expect(isScoreAnswer(scoreAns)).toBe(true);
    expect(isScoreAnswer(noulAns)).toBe(false);
    expect(isScoreAnswer(invalidAns)).toBe(false);
  });

  it("case 1: benign responses evaluate to pass with no findings", () => {
    const answers = makeAnswers();
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("pass");
    expect(result.findings).toEqual([]);
  });

  it("case 2: jailbreak noul 0.7 triggers block verdict with jailbreak rule finding", () => {
    const answers = makeAnswers({ jailbreakNoul: 0.7 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("jailbreak");
    expect(result.findings[0]?.severity).toBe("block");
  });

  it("case 3: refusal noul 0.9 triggers block verdict with refusal rule finding", () => {
    const answers = makeAnswers({ refusalNoul: 0.9 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("refusal");
    expect(result.findings[0]?.severity).toBe("block");
  });

  it("case 4: harm score 3 triggers block verdict with harm_level rule finding", () => {
    const answers = makeAnswers({ harmScore: 3 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("block");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("harm_level");
    expect(result.findings[0]?.severity).toBe("block");
  });

  it("case 5: harm score 2 with conf 0.9 and block threshold 1.5 triggers block", () => {
    const answers = makeAnswers({ harmScore: 2, harmConfidence: 0.9 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("block");
    expect(result.findings[0]?.rule).toBe("harm_level");
  });

  it("case 6: harm score 2 with conf 0.9 and custom harmBlock 2.5 triggers flag, not block", () => {
    const answers = makeAnswers({ harmScore: 2, harmConfidence: 0.9 });
    const customThresholds = { ...DEFAULT_THRESHOLDS, harmBlock: 2.5 };
    const result = evaluateAnswers(answers, customThresholds);
    expect(result.verdict).toBe("flag");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("harm_level");
    expect(result.findings[0]?.severity).toBe("flag");
  });

  it("case 7: uncertainty score 2 with conf 0.9 triggers flag verdict with uncertainty rule finding", () => {
    const answers = makeAnswers({ uncertaintyScore: 2, uncertaintyConfidence: 0.9 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("flag");
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.rule).toBe("uncertainty");
    expect(result.findings[0]?.severity).toBe("flag");
  });

  it("case 8: jailbreak 0.7 AND uncertainty 2/conf 0.9 results in block verdict with both findings", () => {
    const answers = makeAnswers({ jailbreakNoul: 0.7, uncertaintyScore: 2, uncertaintyConfidence: 0.9 });
    const result = evaluateAnswers(answers, DEFAULT_THRESHOLDS);
    expect(result.verdict).toBe("block");
    expect(result.findings).toHaveLength(2);
    expect(result.findings.some((f) => f.rule === "jailbreak" && f.severity === "block")).toBe(true);
    expect(result.findings.some((f) => f.rule === "uncertainty" && f.severity === "flag")).toBe(true);
  });

  it("case 9: boundary checks - strict > for noul and >= for score", () => {
    // Exactly 0.5 with jailbreakBlock 0.5 should NOT fire (strict >)
    const exactNoulAnswers = makeAnswers({ jailbreakNoul: 0.5 });
    const noulResult = evaluateAnswers(exactNoulAnswers, DEFAULT_THRESHOLDS);
    expect(noulResult.verdict).toBe("pass");
    expect(noulResult.findings).toHaveLength(0);

    // Exactly score 1 with harmFlag 0.8 and confident SHOULD fire (>= 0.8)
    const exactScoreAnswers = makeAnswers({ harmScore: 1, harmConfidence: 0.9 });
    const scoreResult = evaluateAnswers(exactScoreAnswers, { ...DEFAULT_THRESHOLDS, harmBlock: 2.5 });
    expect(scoreResult.verdict).toBe("flag");
    expect(scoreResult.findings).toHaveLength(1);
    expect(scoreResult.findings[0]?.rule).toBe("harm_level");
  });
});
