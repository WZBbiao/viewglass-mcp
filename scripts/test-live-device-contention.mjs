#!/usr/bin/env node
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const serverEntry = path.join(root, "dist", "index.js");
const bundleId = process.env.VIEWGLASS_E2E_BUNDLE_ID ?? "com.wzb.ViewglassDemo";
const deviceIdentifier = process.env.VIEWGLASS_E2E_DEVICE_IDENTIFIER;

if (!deviceIdentifier) {
  throw new Error("VIEWGLASS_E2E_DEVICE_IDENTIFIER is required");
}

class MCPClient {
  constructor(name) {
    this.name = name;
    this.nextId = 1;
    this.pending = new Map();
    this.proc = spawn(process.execPath, [serverEntry], {
      cwd: root,
      env: {
        ...process.env,
        VIEWGLASS_MCP_FEEDBACK_FILE: `/tmp/viewglass-${name}-feedback.jsonl`,
      },
      stdio: ["pipe", "pipe", "inherit"],
    });
    const lines = createInterface({ input: this.proc.stdout });
    lines.on("line", (line) => {
      try {
        const response = JSON.parse(line);
        this.pending.get(response.id)?.(response);
        this.pending.delete(response.id);
      } catch {
        // MCP stdout is JSONL; ignore unrelated output defensively.
      }
    });
  }

  send(method, params) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`${this.name} timed out calling ${method}`));
      }, 40_000);
      this.pending.set(id, (response) => {
        clearTimeout(timer);
        resolve(response);
      });
      this.proc.stdin.write(`${JSON.stringify({ jsonrpc: "2.0", id, method, params })}\n`);
    });
  }

  async callTool(name, args) {
    if (!this.initialized) {
      await this.send("initialize", {
        protocolVersion: "2024-11-05",
        capabilities: {},
        clientInfo: { name: this.name, version: "0.0.1" },
      });
      this.initialized = true;
    }
    const response = await this.send("tools/call", { name, arguments: args });
    if (response.error) throw new Error(response.error.message);
    return response.result;
  }

  async close() {
    if (this.proc.exitCode !== null) return;
    this.proc.stdin.end();
    await Promise.race([
      new Promise((resolve) => this.proc.once("exit", resolve)),
      new Promise((resolve) => setTimeout(resolve, 2_000)),
    ]);
    if (this.proc.exitCode === null) {
      this.proc.kill("SIGTERM");
      await new Promise((resolve) => this.proc.once("exit", resolve));
    }
  }
}

function firstText(result) {
  return result?.content?.[0]?.text ?? "";
}

const first = new MCPClient("lease-owner");
const second = new MCPClient("lease-contender");

try {
  const ownerConnect = await first.callTool("ui_connect", { bundleId, deviceIdentifier });
  if (ownerConnect.isError) throw new Error(`owner failed to connect: ${firstText(ownerConnect)}`);
  const owner = JSON.parse(firstText(ownerConnect));

  const contenderConnect = await second.callTool("ui_connect", { bundleId, deviceIdentifier });
  const contentionText = firstText(contenderConnect);
  if (!contenderConnect.isError || !contentionText.includes("already connected") || !contentionText.includes("Only one agent")) {
    throw new Error(`contender did not receive exclusive-device guidance: ${contentionText}`);
  }

  const scan = await second.callTool("ui_scan", {});
  const scanText = firstText(scan);
  if (scan.isError || !scanText.includes(deviceIdentifier)) {
    throw new Error(`contender could not scan for alternative devices: ${scanText}`);
  }

  const bypassAttempt = await second.callTool("ui_snapshot", {
    session: owner.session,
  });
  const bypassText = firstText(bypassAttempt);
  if (!bypassAttempt.isError || !bypassText.includes("already connected") || !bypassText.includes("Only one agent")) {
    throw new Error(`direct device tool bypassed or obscured the lease: ${bypassText}`);
  }

  const feedback = await second.callTool("ui_feedback", {
    title: "lease contention test",
    summary: "Non-device feedback remains available while another agent owns the device.",
    outcome: "success",
  });
  if (feedback.isError) throw new Error(`feedback was blocked by device lease: ${firstText(feedback)}`);

  await first.close();
  const handoff = await second.callTool("ui_connect", { bundleId, deviceIdentifier });
  if (handoff.isError) throw new Error(`contender could not acquire after owner exit: ${firstText(handoff)}`);

  process.stdout.write("live device contention: owner acquired; contender rejected with guidance; scan and feedback bypassed; handoff after exit passed\n");
} finally {
  await first.close();
  await second.close();
}
