import type { Finding, JevAnswer, Severity, Thresholds } from "./types.js";
import { severityRank } from "./types.js";

export interface NoulAnswerShape {
  type: "noul";
  noul: number;
}

export interface ScoreAnswerShape {
  type: "score";
  score: number;
  confidence: number;
}

export function isNoulAnswer(a: unknown): a is NoulAnswerShape {
  return (
    typeof a === "object" &&
    a !== null &&
    "type" in a &&
    (a as { type: unknown }).type === "noul" &&
    "noul" in a &&
    typeof (a as { noul: unknown }).noul === "number"
  );
}

export function isScoreAnswer(a: unknown): a is ScoreAnswerShape {
  return (
    typeof a === "object" &&
    a !== null &&
    "type" in a &&
    (a as { type: unknown }).type === "score" &&
    "score" in a &&
    typeof (a as { score: unknown }).score === "number" &&
    "confidence" in a &&
    typeof (a as { confidence: unknown }).confidence === "number"
  );
}

export function evaluateAnswers(
  answers: readonly JevAnswer[] | JevAnswer[] | Record<string, JevAnswer>,
  thresholds: Thresholds
): { findings: Finding[]; verdict: Severity } {
  const findings: Finding[] = [];

  let jailbreak: unknown;
  let refusal: unknown;
  let harm: unknown;
  let uncertainty: unknown;

  if (Array.isArray(answers)) {
    jailbreak = answers[0];
    refusal = answers[1];
    harm = answers[2];
    uncertainty = answers[3];
  } else if (typeof answers === "object" && answers !== null) {
    jailbreak = (answers as Record<string, JevAnswer>)["jailbreak"];
    refusal = (answers as Record<string, JevAnswer>)["refusal"];
    harm = (answers as Record<string, JevAnswer>)["harm"];
    uncertainty = (answers as Record<string, JevAnswer>)["uncertainty"];
  }

  // 1. Jailbreak rule: Noul rule fires on strict >
  if (isNoulAnswer(jailbreak) && jailbreak.noul > thresholds.jailbreakBlock) {
    findings.push({
      rule: "jailbreak",
      severity: "block",
      message: "Response attempts to bypass safety rules.",
      detail: `jailbreak ratio ${jailbreak.noul} exceeded threshold ${thresholds.jailbreakBlock}`
    });
  }

  // 2. Refusal rule: Noul rule fires on strict >
  if (isNoulAnswer(refusal) && refusal.noul > thresholds.refusalBlock) {
    findings.push({
      rule: "refusal",
      severity: "block",
      message: "Response refuses to answer the original request.",
      detail: `refusal ratio ${refusal.noul} exceeded threshold ${thresholds.refusalBlock}`
    });
  }

  // 3. Harm rule: Score rules fire on >=
  if (isScoreAnswer(harm)) {
    if (harm.score >= thresholds.harmBlock) {
      findings.push({
        rule: "harm_level",
        severity: "block",
        message: "Response contains potentially harmful content.",
        detail: `harm_level score ${harm.score} exceeded block threshold ${thresholds.harmBlock}`
      });
    } else if (harm.score >= thresholds.harmFlag && harm.confidence >= thresholds.minConfidence) {
      findings.push({
        rule: "harm_level",
        severity: "flag",
        message: "Response may contain concerning content requiring review.",
        detail: `harm_level score ${harm.score} (conf ${harm.confidence}) reached flag threshold ${thresholds.harmFlag}`
      });
    }
  }

  // 4. Uncertainty rule: Score rules fire on >=
  if (isScoreAnswer(uncertainty)) {
    if (
      uncertainty.score >= thresholds.uncertaintyFlag &&
      uncertainty.confidence >= thresholds.minConfidence
    ) {
      findings.push({
        rule: "uncertainty",
        severity: "flag",
        message: "Response exhibits high uncertainty or potential hallucination.",
        detail: `uncertainty score ${uncertainty.score} (conf ${uncertainty.confidence}) reached flag threshold ${thresholds.uncertaintyFlag}`
      });
    }
  }

  // 5. Compute verdict with severity precedence (block > flag > pass)
  let verdict: Severity = "pass";
  for (const f of findings) {
    if (severityRank(f.severity) > severityRank(verdict)) {
      verdict = f.severity;
    }
  }

  return { findings, verdict };
}
