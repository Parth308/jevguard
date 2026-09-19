# JevGuard

Type-safe guardrail middleware for LLM output, powered by Jev (TypeSafe System One).

## Why Jev

Modern LLM guardrails face an uncomfortable trade-off: traditional regex filters are brittle and easily bypassed, while LLM-as-a-judge approaches add 2–5 seconds of latency and substantial token cost to every single generation.

Jev evaluates parallel typed questions (Noul / Score / Choice) in **70–500ms**, executing ~40–200x faster and costing ~444x less than standard LLM-judge calls. By dispatching targeted checks (jailbreak detection, refusal detection, harm scoring, and uncertainty estimation) in a single request, JevGuard provides real-time verdicts without ruining stream latency or ballooning cloud bills.

> **Caveat & Honest Positioning:**
> Jev returns *format-correct* answers, not guaranteed-correct answers (~68% eval accuracy). Treat verdicts and findings as **advisory signals** and risk filters, never as a standalone correctness oracle. JevGuard surfaces raw answers, token usage, and latency on every call so your system can make informed routing decisions.

---

## Install & Requirements

- **Node.js**: `>= 20`
- **Dependencies**: `@typesafe-ai/sdk` (`^0.6.0`)

```bash
npm install
```

Set your TypeSafe AI API key:
```bash
# Get your key at https://console.typesafe.ai/keys
export TYPESAFE_API_KEY="sk-..."
```

---

## CLI Usage

JevGuard includes a lightweight CLI designed for CI/CD pipelines, local testing, and shell scripting.

```bash
npm run guard -- --response "Model response to verify" [--prompt "Original prompt"] [--pretty]
```

### Exit Codes

| Exit Code | Verdict | Description |
|-----------|---------|-------------|
| `0` | `pass` | Output passed all threshold checks without blocking or flagging issues. |
| `1` | `flag` | Output triggered advisory flag-level thresholds (e.g. concerning harm or uncertainty). |
| `2` | `block` | Output exceeded blocking thresholds (e.g. jailbreak attempt, refusal, or high harm). |
| `3` | `error` | Usage error (e.g. missing `--response`) or guard execution failure. |

### Example Output

```json
{
  "verdict": "pass",
  "findings": [],
  "usage": {
    "input_tokens": 42,
    "output_tokens": 18
  },
  "latencyMs": 142.5
}
```

---

## Library Usage

You can embed `JevGuard` directly into your TypeScript or Node.js backend:

```ts
import { JevGuard } from "jevguard";

const guard = new JevGuard();

const verdict = await guard.analyze({
  prompt: "Write a poem about nature",
  response: "The green leaves whisper in the wind..."
});

if (verdict.verdict === "block") {
  throw new Error(`Output blocked: ${verdict.findings.map(f => f.message).join(", ")}`);
}

console.log(verdict);
```

### `GuardVerdict` Shape

```ts
export interface GuardVerdict {
  verdict: "block" | "flag" | "pass";
  findings: Finding[];
  answers: Record<string, JevAnswer>;
  usage: {
    input_tokens: number;
    output_tokens: number;
  };
  latencyMs: number;
}
```

---

## Default Question Profile & Thresholds

JevGuard runs 4 parallel questions across every guarded response:

| Question Name | Type | Description |
|---------------|------|-------------|
| `jailbreak` | `noul` | Detects attempts to bypass safety rules or jailbreak an AI model. |
| `refusal` | `noul` | Detects whether the model declined or apologized instead of helping. |
| `harm` | `score` | Rates harm on an ordered rubric: `Low (0)`, `Medium (1)`, `High (2)`. |
| `uncertainty` | `score` | Rates uncertainty: `Low (0)`, `Medium (1)`, `High (2)`. |

### Default Thresholds

```ts
export const DEFAULT_THRESHOLDS: Thresholds = {
  jailbreakBlock: 0.5,   // noul ratio > 0.5 => block
  refusalBlock: 0.5,     // noul ratio > 0.5 => block
  harmBlock: 1.5,        // harm score >= 1.5 (High) => block
  harmFlag: 0.8,         // harm score >= 0.8 (Medium+) and confident => flag
  uncertaintyFlag: 0.8,  // uncertainty score >= 0.8 (Medium+) and confident => flag
  minConfidence: 0.5     // minimum confidence required to trigger flags
};
```

> **Threshold Semantics:**
> - **Noul questions** fire on **strict `>`** (e.g. `noul > 0.5`).
> - **Score questions** fire on **`>=`** (e.g. `score >= 1.5`).
> - Severity precedence is **`block` > `flag` > `pass`**. A `flag` finding will never downgrade a `block`.

### Overriding Thresholds

You can customize thresholds globally in the constructor or per invocation:

```ts
// Custom instance thresholds
const strictGuard = new JevGuard(undefined, {
  harmBlock: 1.0,
  minConfidence: 0.7
});

// Per-call override
const result = await guard.analyze({
  response: "Some text",
  thresholds: {
    harmBlock: 2.0
  }
});
```

---

## Roadmap (v1)

- [ ] **Vercel AI SDK stream interceptor**: Real-time chunk evaluation and abort controller hook.
- [ ] **Zod schema guardrails**: Automated structural validation alongside Jev semantic verification.
- [ ] **Prompt-side intent guard**: Pre-execution prompt safety analysis.
- [ ] **Eval suite & benchmarks**: Labeled guardrail test dataset with latency and cost comparative metrics.
- [ ] **Binary packaging & npm release**: Standalone global CLI distribution.
- [ ] **Python SDK wrapper**: Native Python middleware for LangChain and LiteLLM.

---

## License

[MIT](LICENSE) © 2026 Parth
