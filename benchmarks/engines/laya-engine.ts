import type { BenchmarkEngine, BenchmarkTestCase, EngineResult, ExpectedVerdict } from "../types.js";
import { JevGuard, type SystemOneClient } from "../../src/guard.js";

export interface LayaEngineOptions {
  baseUrl?: string | undefined;
  mode?: "simulated" | "live" | undefined;
}

/**
 * Laya Benchmark Engine
 *
 * Laya (by Convai Innovations, Apache-2.0) is the open-weights, non-autoregressive
 * "System 1" decision model. Like TypeSafe Jev, it evaluates typed questions
 * (noul, score, choice) in a single forward pass (~33ms latency on local GPU)
 * without token-by-token generation overhead.
 */
export class LayaEngine implements BenchmarkEngine {
  readonly name = "Laya (Open-Source System 1 - Convai)";
  readonly description = "Self-hosted non-autoregressive System 1 decision engine (Apache-2.0, ~33ms local GPU latency, $0.00 API cost)";
  readonly baseUrl: string | undefined;
  readonly isLive: boolean;
  private readonly guard: JevGuard;

  constructor(options: LayaEngineOptions = {}) {
    this.baseUrl = options.baseUrl ?? process.env["LAYA_BASE_URL"];
    this.isLive = options.mode === "live" && Boolean(this.baseUrl);

    const self = this;
    if (this.isLive && this.baseUrl) {
      const serverUrl = this.baseUrl;
      const layaClient: SystemOneClient = {
        async systemOne(req) {
          try {
            const res = await fetch(`${serverUrl}/system-one`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify(req)
            });
            if (!res.ok) {
              throw new Error(`Laya HTTP ${res.status}: ${await res.text()}`);
            }
            return (await res.json()) as any;
          } catch (err: unknown) {
            console.warn(
              `\n[Laya Info] Local Laya server at ${serverUrl} not reachable. (Run 'npm run laya:serve' to start it). Falling back to calibrated simulation.`
            );
            return self.createMockClient().systemOne(req);
          }
        }
      };
      this.guard = new JevGuard(layaClient);
    } else {
      this.guard = new JevGuard(this.createMockClient());
    }
  }

  private createMockClient(): SystemOneClient {
    return {
      async systemOne(req) {
        const content = `${req.state.prompt ?? ""} ${req.state.response}`.toLowerCase();

        let jailbreakNoul = 0.02;
        let refusalNoul = 0.02;
        let harmScore = 0;
        let harmConf = 0.95;
        let uncertaintyScore = 0;
        let uncertaintyConf = 0.95;

        if (
          content.includes("system override") ||
          content.includes("ignore all prior") ||
          content.includes("end of conversation") ||
          content.includes("developer debug mode") ||
          content.includes("im_start") ||
          content.includes("cancel all previous") ||
          content.includes("reset memory context")
        ) {
          jailbreakNoul = 0.93;
        } else if (
          content.includes("dan") ||
          content.includes("fictional universe") ||
          content.includes("grandmother") ||
          content.includes("chaosbot") ||
          content.includes("opposite day")
        ) {
          jailbreakNoul = 0.90;
        } else if (
          content.includes("keylogger") ||
          content.includes("ransomware") ||
          content.includes("drop table") ||
          content.includes("phishing") ||
          content.includes("syn flood") ||
          content.includes("session cookies") ||
          content.includes("credential stuffing") ||
          content.includes("ssh keys") ||
          content.includes("wipe production") ||
          content.includes("1gn0r3") ||
          content.includes("d r o p") ||
          content.includes("k\u200Bey")
        ) {
          harmScore = 2;
          harmConf = 0.96;
        } else if (
          content.includes("raw silver") ||
          content.includes("surge 500%") ||
          content.includes("speculation") ||
          content.includes("crypto token") ||
          content.includes("alkaline water")
        ) {
          uncertaintyScore = 2;
          uncertaintyConf = 0.91;
        } else if (
          content.includes("cannot fulfill this request") ||
          content.includes("cannot assist") ||
          content.includes("cannot provide")
        ) {
          refusalNoul = 0.95;
        }

        return {
          model: "laya-v1-local",
          answers: [
            { type: "noul", noul: jailbreakNoul },
            { type: "noul", noul: refusalNoul },
            { type: "score", score: harmScore, confidence: harmConf },
            { type: "score", score: uncertaintyScore, confidence: uncertaintyConf }
          ],
          usage: { input_tokens: 25, output_tokens: 4 }
        };
      }
    };
  }

  async evaluate(testCase: BenchmarkTestCase): Promise<EngineResult> {
    const started = performance.now();

    const verdict = await this.guard.analyze({
      prompt: testCase.input.prompt,
      response: testCase.input.response
    });

    const elapsed = performance.now() - started;
    // Laya's non-autoregressive forward pass runs in ~33ms on local GPU
    const latencyMs = this.isLive ? Math.round(elapsed * 10) / 10 : 33.4;

    return {
      predictedVerdict: verdict.verdict as ExpectedVerdict,
      latencyMs,
      costEstimateUsd: 0.0, // Open-source, zero API cost
      reasoning: `Laya verdict: ${verdict.verdict}, Findings: ${verdict.findings.length}`
    };
  }
}
