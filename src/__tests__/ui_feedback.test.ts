import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { uiFeedback } from "../tools/ui_feedback.js";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("uiFeedback", () => {
  it("appends structured JSONL to project-local feedback file by default", () => {
    const project = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-feedback-"));
    try {
      const result = uiFeedback({
        title: "Input target was unclear",
        task: "Publish a review",
        summary: "Agent tried WKContentView before finding TapTextView.",
        expected: "Snapshot should expose the exact input target.",
        actual: "Agent saw several editor wrapper nodes.",
        session: "com.test@1234",
        tools: ["ui_snapshot", "ui_input"],
        artifacts: ["/tmp/screen.png"],
        suggestion: "Expose inputCandidates.",
        severity: "warning",
        outcome: "partial",
      }, project);

      expect(result.ok).toBe(true);
      expect(result.path).toBe(path.join(project, ".viewglassmcp", "feedback.jsonl"));

      const lines = fs.readFileSync(result.path, "utf8").trim().split("\n");
      expect(lines).toHaveLength(1);
      const record = JSON.parse(lines[0]) as Record<string, unknown>;
      expect(record.title).toBe("Input target was unclear");
      expect(record.outcome).toBe("partial");
      expect(record.tools).toEqual(["ui_snapshot", "ui_input"]);
      expect(record.artifacts).toEqual(["/tmp/screen.png"]);
      expect(record.id).toBe(result.id);
    } finally {
      fs.rmSync(project, { recursive: true, force: true });
    }
  });

  it("honors VIEWGLASS_MCP_FEEDBACK_FILE", () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "viewglass-feedback-env-"));
    const file = path.join(dir, "feedback.jsonl");
    vi.stubEnv("VIEWGLASS_MCP_FEEDBACK_FILE", file);
    try {
      const result = uiFeedback({ title: "Blocked", summary: "Could not complete flow.", outcome: "blocked" }, dir);

      expect(result.path).toBe(file);
      const record = JSON.parse(fs.readFileSync(file, "utf8").trim()) as Record<string, unknown>;
      expect(record.title).toBe("Blocked");
      expect(record.outcome).toBe("blocked");
    } finally {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  });

  it("rejects empty title and summary", () => {
    expect(() => uiFeedback({ title: " ", summary: "x" })).toThrow("non-empty title");
    expect(() => uiFeedback({ title: "x", summary: " " })).toThrow("non-empty summary");
  });
});
