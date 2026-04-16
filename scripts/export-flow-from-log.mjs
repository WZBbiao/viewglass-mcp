#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { basename, resolve } from 'node:path';

function usage() {
  console.error(
    'Usage: node scripts/export-flow-from-log.mjs <log-file> [--include-screenshots] [--all-runs] [--gap-ms <n>]'
  );
  process.exit(1);
}

const argv = process.argv.slice(2);
if (argv.length === 0) usage();

function readFlag(name) {
  return argv.includes(name);
}

function readOption(name, fallback) {
  const idx = argv.indexOf(name);
  if (idx < 0) return fallback;
  const value = argv[idx + 1];
  if (!value || value.startsWith('--')) return fallback;
  return value;
}

const includeScreenshots = readFlag('--include-screenshots');
const allRuns = readFlag('--all-runs');
const gapMs = Number(readOption('--gap-ms', '180000'));
const logPathArg = argv.find((arg, index) => {
  if (arg.startsWith('--')) return false;
  if (index > 0 && argv[index - 1] === '--gap-ms') return false;
  return true;
});
if (!logPathArg) usage();

const logPath = resolve(logPathArg);
const lines = readFileSync(logPath, 'utf8').split(/\r?\n/).filter(Boolean);

const TOOL_START_RE = /^(?<ts>\S+) \[tool:start\] name=(?<name>\S+)(?: session=(?<session>\S+))? args=(?<payload>.+)$/;
const TOOL_END_RE = /^(?<ts>\S+) \[tool:end\] name=(?<name>\S+)(?: session=(?<session>\S+))? durationMs=(?<duration>\d+) result=(?<payload>.+)$/;
const TOOL_ERR_RE = /^(?<ts>\S+) \[tool:error\] name=(?<name>\S+)(?: session=(?<session>\S+))? durationMs=(?<duration>\d+) error=(?<payload>.+)$/;

function parseJSON(raw, fallback = null) {
  try {
    return JSON.parse(raw);
  } catch {
    return fallback;
  }
}

function queueKey(name, session) {
  return `${session ?? ''}::${name}`;
}

function isPlainObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value);
}

function normalizeStep(name, toolArgs, durationMs) {
  switch (name) {
    case 'ui_snapshot':
      return {
        tool: 'ui_snapshot',
        durationMs,
        filter: typeof toolArgs.filter === 'string' ? toolArgs.filter : undefined,
        compact: typeof toolArgs.compact === 'boolean' ? toolArgs.compact : undefined,
      };
    case 'ui_tap':
      return {
        tool: 'ui_tap',
        durationMs,
        oid: String(toolArgs.oid),
      };
    case 'ui_input':
      return {
        tool: 'ui_input',
        durationMs,
        oid: String(toolArgs.oid),
        text: typeof toolArgs.text === 'string' ? toolArgs.text : '',
      };
    case 'ui_scroll':
      return {
        tool: 'ui_scroll',
        durationMs,
        oid: String(toolArgs.oid),
        direction: typeof toolArgs.direction === 'string' ? toolArgs.direction : undefined,
        distance: typeof toolArgs.distance === 'number' ? toolArgs.distance : undefined,
      };
    case 'ui_dismiss':
      return {
        tool: 'ui_dismiss',
        durationMs,
        oid: String(toolArgs.oid),
      };
    case 'ui_wait':
      return {
        tool: 'ui_wait',
        durationMs,
        appears: typeof toolArgs.appears === 'string' ? toolArgs.appears : undefined,
        gone: typeof toolArgs.gone === 'string' ? toolArgs.gone : undefined,
        timeoutMs: typeof toolArgs.timeoutMs === 'number' ? toolArgs.timeoutMs : undefined,
      };
    case 'ui_attr_get':
      return {
        tool: 'ui_attr_get',
        durationMs,
        oid: String(toolArgs.oid),
        attributes: Array.isArray(toolArgs.attributes) ? toolArgs.attributes : undefined,
      };
    case 'ui_screenshot':
      if (!includeScreenshots) return null;
      return {
        tool: 'ui_screenshot',
        durationMs,
        target: typeof toolArgs.oid === 'string' || typeof toolArgs.oid === 'number' ? String(toolArgs.oid) : 'screen',
      };
    default:
      return null;
  }
}

function toMillis(iso) {
  return Number.isNaN(Date.parse(iso)) ? 0 : Date.parse(iso);
}

const starts = new Map();
const events = [];
let activeSession;
let firstTs;
let lastTs;

for (const line of lines) {
  const startMatch = line.match(TOOL_START_RE);
  if (startMatch?.groups) {
    const { ts, name, session, payload } = startMatch.groups;
    const parsed = parseJSON(payload, {});
    const key = queueKey(name, session);
    const queue = starts.get(key) ?? [];
    queue.push({ ts, name, session, args: isPlainObject(parsed) ? parsed : {} });
    starts.set(key, queue);
    activeSession ??= session;
    firstTs ??= ts;
    lastTs = ts;
    continue;
  }

  const endMatch = line.match(TOOL_END_RE);
  if (endMatch?.groups) {
    const { ts, name, session, duration, payload } = endMatch.groups;
    const key = queueKey(name, session);
    const queue = starts.get(key) ?? [];
    const start = queue.shift();
    starts.set(key, queue);
    activeSession ??= session;
    firstTs ??= ts;
    lastTs = ts;

    const parsedResult = parseJSON(payload, {});
    const firstText = isPlainObject(parsedResult) ? parsedResult.firstText : undefined;
    const resultText = typeof firstText === 'string' ? parseJSON(firstText, null) : null;
    const failed = isPlainObject(parsedResult) && parsedResult.isError === true;

    events.push({
      kind: failed ? 'ignored' : 'step',
      name,
      ts: start?.ts ?? ts,
      session,
      durationMs: Number(duration),
      args: start?.args ?? {},
      resultText,
      reason: !start ? 'unpaired-end' : failed ? 'tool-error-result' : undefined,
    });
    continue;
  }

  const errMatch = line.match(TOOL_ERR_RE);
  if (errMatch?.groups) {
    const { ts, name, session } = errMatch.groups;
    const key = queueKey(name, session);
    const queue = starts.get(key) ?? [];
    const start = queue.shift();
    starts.set(key, queue);
    activeSession ??= session;
    firstTs ??= ts;
    lastTs = ts;
    events.push({
      kind: 'ignored',
      name,
      ts: start?.ts ?? ts,
      session,
      durationMs: 0,
      args: start?.args ?? {},
      reason: 'tool-error',
    });
  }
}

const filteredEvents = events.filter((event) => !event.session || event.session === activeSession);
filteredEvents.sort((a, b) => toMillis(a.ts) - toMillis(b.ts));

function splitRuns(items) {
  const runs = [];
  let current = [];
  for (const item of items) {
    if (current.length === 0) {
      current.push(item);
      continue;
    }
    const prev = current[current.length - 1];
    if (toMillis(item.ts) - toMillis(prev.ts) > gapMs) {
      runs.push(current);
      current = [item];
      continue;
    }
    current.push(item);
  }
  if (current.length > 0) runs.push(current);
  return runs;
}

function buildRunOutput(items, index) {
  const steps = [];
  const ignored = [];
  for (const item of items) {
    if (item.kind === 'step') {
      const step = normalizeStep(item.name, item.args, item.durationMs);
      if (!step) {
        ignored.push({ name: item.name, reason: 'unsupported-tool', ts: item.ts });
        continue;
      }
      if (item.resultText && item.resultText.ok === false) {
        ignored.push({ name: item.name, reason: 'result-not-ok', ts: item.ts });
        continue;
      }
      steps.push({ at: item.ts, ...step });
      continue;
    }
    ignored.push({ name: item.name, reason: item.reason ?? 'ignored', ts: item.ts });
  }

  const startedAt = items[0]?.ts ?? null;
  const finishedAt = items[items.length - 1]?.ts ?? null;
  return {
    index,
    startedAt,
    finishedAt,
    flowDraft: {
      name: activeSession ? `flow-${activeSession.replace(/[^\w.@-]+/g, '_')}-run-${index + 1}` : `flow-draft-run-${index + 1}`,
      session: activeSession ?? null,
      stepCount: steps.length,
      steps,
    },
    ignored,
  };
}

const runs = splitRuns(filteredEvents).map(buildRunOutput);
const selectedRuns = allRuns ? runs : runs.slice(-1);

const output = {
  version: 1,
  source: {
    kind: 'viewglass-mcp-log',
    file: logPath,
    fileName: basename(logPath),
    session: activeSession ?? null,
    startedAt: firstTs ?? null,
    finishedAt: lastTs ?? null,
    detectedRunCount: runs.length,
    exportedLatestOnly: !allRuns,
    gapMs,
  },
  runs: selectedRuns,
};

process.stdout.write(`${JSON.stringify(output, null, 2)}\n`);
