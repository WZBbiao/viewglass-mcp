#!/usr/bin/env node
import { cpSync, existsSync, mkdirSync, readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

function usage() {
  console.error('Usage: node scripts/init-project-memory.mjs <project-dir> [--force]');
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage();

const force = argv.includes('--force');
const projectArg = argv.find((arg) => !arg.startsWith('--'));
if (!projectArg) usage();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const templateRoot = join(__dirname, '..', 'templates', '.viewglassmcp');
const projectRoot = resolve(projectArg);
const targetRoot = join(projectRoot, '.viewglassmcp');

if (!existsSync(templateRoot)) {
  console.error(`Template directory not found: ${templateRoot}`);
  process.exit(1);
}

mkdirSync(projectRoot, { recursive: true });
mkdirSync(targetRoot, { recursive: true });

const copied = [];
const skipped = [];

for (const entry of readdirSync(templateRoot)) {
  const source = join(templateRoot, entry);
  const target = join(targetRoot, entry);
  if (existsSync(target) && !force) {
    skipped.push(entry);
    continue;
  }
  cpSync(source, target, { recursive: true, force: true });
  copied.push(entry);
}

process.stdout.write(
  `${JSON.stringify(
    {
      ok: true,
      projectRoot,
      targetRoot,
      copied,
      skipped,
      force,
      nextSteps: [
        'Read .viewglassmcp/README.md',
        'Update .viewglassmcp/recipes.yaml after successful live tasks',
      ],
    },
    null,
    2
  )}\n`
);
