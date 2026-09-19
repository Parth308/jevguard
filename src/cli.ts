import { JevGuard } from "./guard.js";

export interface CliDeps {
  createGuard: () => JevGuard;
  stdout: (line: string) => void;
  stderr: (line: string) => void;
  exit: (code: number) => void;
}

export interface CliOptions {
  prompt?: string;
  response: string;
  pretty: boolean;
}

export function parseArgs(argv: string[]): CliOptions {
  let response = "";
  let prompt: string | undefined;
  let pretty = false;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === undefined) continue;

    if (arg === "--pretty") {
      pretty = true;
    } else if (arg.startsWith("--response=")) {
      response = arg.slice("--response=".length);
    } else if (arg === "--response") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) {
        throw new Error("Missing value for flag: --response");
      }
      response = next;
    } else if (arg.startsWith("--prompt=")) {
      prompt = arg.slice("--prompt=".length);
    } else if (arg === "--prompt") {
      const next = argv[++i];
      if (next === undefined || next.startsWith("--")) {
        throw new Error("Missing value for flag: --prompt");
      }
      prompt = next;
    } else {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }

  const result: CliOptions = {
    response,
    pretty
  };
  if (prompt !== undefined) {
    result.prompt = prompt;
  }
  return result;
}

export async function runCli(argv: string[], deps: CliDeps): Promise<void> {
  let opts: CliOptions;
  try {
    opts = parseArgs(argv);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.stderr("Error: " + message);
    deps.exit(3);
    return;
  }

  if (!opts.response && !opts.prompt) {
    deps.stderr("Error: --response is required (the model output to guard), or provide --prompt to evaluate user intent.");
    deps.exit(3);
    return;
  }

  const guard = deps.createGuard();
  try {
    let verdict: {
      verdict: string;
      findings: unknown[];
      usage?: unknown;
      latencyMs: number;
    };

    if (opts.response) {
      const guardInput: { response: string; prompt?: string } = {
        response: opts.response
      };
      if (opts.prompt) {
        guardInput.prompt = opts.prompt;
      }
      verdict = await guard.analyze(guardInput);
    } else {
      verdict = await guard.analyzePrompt({
        prompt: opts.prompt!
      });
    }

    const outputObj = {
      verdict: verdict.verdict,
      findings: verdict.findings,
      usage: verdict.usage,
      latencyMs: verdict.latencyMs
    };

    deps.stdout(JSON.stringify(outputObj, null, opts.pretty ? 2 : undefined));
    deps.exit(verdict.verdict === "block" ? 2 : verdict.verdict === "flag" ? 1 : 0);
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    deps.stderr("Guard failed: " + message);
    deps.exit(3);
  }
}
