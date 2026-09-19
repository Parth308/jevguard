#!/usr/bin/env node
import { JevGuard } from "./guard.js";
import { runCli } from "./cli.js";

void runCli(process.argv.slice(2), {
  createGuard: () => new JevGuard(),
  stdout: (line) => console.log(line),
  stderr: (line) => console.error(line),
  exit: (code) => process.exit(code)
});
