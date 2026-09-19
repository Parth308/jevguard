import type { Finding, GuardVerdict } from "./types.js";

export class JevGuardBlockError extends Error {
  readonly verdict: GuardVerdict;
  readonly findings: Finding[];

  constructor(message: string, verdict: GuardVerdict) {
    super(message);
    this.name = "JevGuardBlockError";
    this.verdict = verdict;
    this.findings = verdict.findings;
    Object.setPrototypeOf(this, new.target.prototype);
  }
}
