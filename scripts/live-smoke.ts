import fs from "node:fs";
import path from "node:path";
import { JevGuard } from "../src/guard.js";

// Load .env if present
const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  const lines = fs.readFileSync(envPath, "utf-8").split("\n");
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#") || !trimmed) continue;
    const match = trimmed.match(/^([A-Z0-9_]+)\s*=\s*(.*)$/);
    if (match && match[1] && match[2]) {
      const varName = match[1];
      const val = match[2].replace(/^["']|["']$/g, "");
      if (!process.env[varName]) {
        process.env[varName] = val;
      }
    }
  }
}

async function main() {
  const typesafeKey = process.env["TYPESAFE_API_KEY"];
  const gatewayKey = process.env["AI_GATEWAY_API_KEY"] || (typesafeKey?.startsWith("vck_") ? typesafeKey : undefined);

  if (gatewayKey) {
    process.env["AI_GATEWAY_API_KEY"] = gatewayKey;
    console.log("=================================================");
    console.log("Detected Vercel AI Gateway Key (vck_...)");
    console.log("Calling typesafe-ai/jev via JevGuard + Vercel AI SDK");
    console.log("=================================================");

    const guard = new JevGuard({ apiKey: gatewayKey });

    try {
      const started = performance.now();
      const verdict = await guard.analyze({
        prompt: "What is the capital of France?",
        response: "The capital of France is Paris. It is known for art and culture."
      });
      const elapsed = Math.round(performance.now() - started);

      console.log("\n--- Vercel AI Gateway Evaluation Succeeded! ---");
      console.log("Verdict:   ", verdict.verdict.toUpperCase());
      console.log("Latency:   ", verdict.latencyMs, `ms (Round-trip: ${elapsed} ms)`);
      console.log("Usage:     ", verdict.usage);
      console.log("Findings:  ", verdict.findings);
      console.log("Answers:   ", JSON.stringify(verdict.answers, null, 2));
    } catch (err: any) {
      console.error("\nVercel AI Gateway call failed:\n", err?.message || err);
      if (err?.message?.includes("credit card")) {
        console.error("\nNote: Vercel requires adding a card at: https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%3Fmodal%3Dadd-credit-card to unlock your free gateway credits.");
      }
      process.exit(1);
    }
    return;
  }

  if (typesafeKey) {
    console.log("Connecting directly to TypeSafe AI System One...");
    const guard = new JevGuard();

    const testPayload = {
      prompt: "What is the capital of France?",
      response: "The capital of France is Paris. It is known for art, fashion, and culture."
    };

    try {
      const started = performance.now();
      const verdict = await guard.analyze(testPayload);
      const roundTrip = Math.round(performance.now() - started);

      console.log("\n==========================================");
      console.log("  Live TypeSafe System One Verified!      ");
      console.log("==========================================");
      console.log(`Verdict:    ${verdict.verdict.toUpperCase()}`);
      console.log(`Latency:    ${verdict.latencyMs} ms (Round-trip: ${roundTrip} ms)`);
      console.log(`Token Usage: In: ${verdict.usage.input_tokens}, Out: ${verdict.usage.output_tokens}`);
      console.log("\nRaw Answers:");
      console.log(JSON.stringify(verdict.answers, null, 2));
      console.log("\nFindings:", verdict.findings);
      console.log("==========================================\n");
    } catch (err: unknown) {
      console.error("Live verification failed:", err);
      process.exit(1);
    }
    return;
  }

  console.error("Error: No API key found in environment or .env file.");
  console.error("Please add your key to .env: TYPESAFE_API_KEY=sk-... or AI_GATEWAY_API_KEY=vck_...");
  process.exit(1);
}

void main();
