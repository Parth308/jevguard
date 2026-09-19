export { JevGuard, type JevGuardOptions, type SystemOneClient } from "./guard.js";
export {
  DEFAULT_THRESHOLDS,
  severityRank,
  type Finding,
  type GuardInput,
  type GuardVerdict,
  type JevAnswer,
  type JevUsage,
  type Severity,
  type Thresholds
} from "./types.js";
export { DEFAULT_PROFILE } from "./questions.js";
export { evaluateAnswers, isNoulAnswer, isScoreAnswer } from "./verdict.js";
export { parseArgs, runCli, type CliDeps, type CliOptions } from "./cli.js";
export { JevGuardBlockError } from "./errors.js";
export {
  createJevGuardMiddleware,
  type JevGuardMiddlewareOptions
} from "./ai/middleware.js";

