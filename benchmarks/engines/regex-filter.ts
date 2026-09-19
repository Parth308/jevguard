import type { BenchmarkEngine, BenchmarkTestCase, EngineResult } from "../types.js";

const BLOCKLIST_PATTERNS: RegExp[] = [
  /\b(ignore (all )?previous instructions|system override|developer (debug )?mode|im_start|cancel all previous|disregard all guidelines)\b/i,
  /\b(act as dan|do anything now|chaosbot)\b/i,
  /\b(drop table|drop database|wipe production)\b/i,
  /\b(keylogger|ransomware|steal credentials|exfiltrate|syn flood|phishing|session cookies)\b/i,
  /\b(cannot fulfill this request|cannot assist with|cannot provide)\b/i
];

export class RegexFilterEngine implements BenchmarkEngine {
  readonly name = "Regex / Keyword Heuristics";
  readonly description = "Fast static regex and substring patterns matching known exploit signatures";

  async evaluate(testCase: BenchmarkTestCase): Promise<EngineResult> {
    const started = performance.now();
    const textToCheck = `${testCase.input.prompt ?? ""} ${testCase.input.response}`;

    let matchedPattern: string | null = null;
    for (const pattern of BLOCKLIST_PATTERNS) {
      if (pattern.test(textToCheck)) {
        matchedPattern = pattern.source;
        break;
      }
    }

    const elapsed = performance.now() - started;
    const latencyMs = Math.max(0.1, Math.round(elapsed * 100) / 100);

    return {
      predictedVerdict: matchedPattern ? "block" : "pass",
      latencyMs,
      costEstimateUsd: 0.0,
      reasoning: matchedPattern ? `Matched regex: /${matchedPattern}/i` : "No regex patterns matched"
    };
  }
}
