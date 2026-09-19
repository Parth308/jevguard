#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { JevGuard } from "./guard.js";
import { runCli } from "./cli.js";

const envPath = path.resolve(process.cwd(), ".env");
if (fs.existsSync(envPath)) {
  try {
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
  } catch {}
}

void runCli(process.argv.slice(2), {
  createGuard: () => new JevGuard(),
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  exit: (code) => process.exit(code)
});
