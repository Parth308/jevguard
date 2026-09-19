import fs from "node:fs";
import path from "node:path";
import { JevGuard } from "../src/guard.js";

// Load .env if present and key not set
if (!process.env["TYPESAFE_API_KEY"]) {
  const envPath = path.resolve(process.cwd(), ".env");
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, "utf-8").split("\n");
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.startsWith("#") || !trimmed) continue;
      const match = trimmed.match(/^TYPESAFE_API_KEY\s*=\s*(.*)$/);
      if (match && match[1]) {
        process.env["TYPESAFE_API_KEY"] = match[1].replace(/^["']|["']$/g, "");
      }
    }
  }
}

async function main() {
  const key = process.env["TYPESAFE_API_KEY"];
  if (!key) {
    console.error("Error: TYPESAFE_API_KEY is not set in environment or .env file.");
    console.error("Please add your key to .env: TYPESAFE_API_KEY=sk-...");
    process.exit(1);
  }

  console.log("Connecting to TypeSafe AI System One...");
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
    console.log(`Latency:    ${verdict.latencyMs} ms (Client round-trip: ${roundTrip} ms)`);
    console.log(`Token Usage: In: ${verdict.usage.input_tokens}, Out: ${verdict.usage.output_tokens}`);
    console.log("\nRaw Answers:");
    console.log(JSON.stringify(verdict.answers, null, 2));
    console.log("\nFindings:", verdict.findings);
    console.log("==========================================\n");
  } catch (err: unknown) {
    console.error("Live verification failed:", err);
    process.exit(1);
  }
}

void main();
