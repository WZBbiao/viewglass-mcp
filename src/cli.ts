#!/usr/bin/env node
import { startServer } from "./server.js";
import { initProject } from "./init.js";

function printHelp() {
  process.stdout.write(`viewglass-mcp\n\nUsage:\n  viewglass-mcp                Start MCP server\n  viewglass-mcp mcp            Start MCP server\n  viewglass-mcp init [options] Install ViewglassMCP skills and update AGENTS.md\n\nOptions for init:\n  --client <claude|agents|auto>\n  --dest <path>\n  --project-root <path>\n  --skill <mcp|cli>\n  --force\n  --print\n  --help\n`);
}

function parseFlag(args: string[], name: string): string | undefined {
  const idx = args.indexOf(name);
  if (idx === -1) return undefined;
  return args[idx + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

async function main() {
  const argv = process.argv.slice(2);

  if (argv.length === 0) {
    await startServer();
    return;
  }

  if (hasFlag(argv, "--help") || hasFlag(argv, "-h") || argv[0] === "help") {
    printHelp();
    return;
  }

  const command = argv[0];

  if (command === "mcp") {
    await startServer();
    return;
  }

  if (command === "init") {
    const result = initProject({
      client: parseFlag(argv, "--client"),
      dest: parseFlag(argv, "--dest"),
      projectRoot: parseFlag(argv, "--project-root"),
      skill: (parseFlag(argv, "--skill") as "mcp" | "cli" | undefined) ?? "mcp",
      force: hasFlag(argv, "--force"),
      print: hasFlag(argv, "--print"),
    });
    if (!hasFlag(argv, "--print")) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    }
    return;
  }

  throw new Error(`Unknown command: ${command}`);
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`);
  process.exit(1);
});
