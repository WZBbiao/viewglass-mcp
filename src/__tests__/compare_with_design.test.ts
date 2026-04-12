import { describe, it, expect, vi } from "vitest";
import { compareWithDesign } from "../tools/compare_with_design.js";
import type { ExecFn } from "../runner.js";

const FIGMA_URL = "https://figma.com/design/abc123/MyApp?node-id=1-2";
const SCREENSHOT_JSON = JSON.stringify({ filePath: "/tmp/viewglass-compare-test.png" });

function makeExec(screenshotOut = SCREENSHOT_JSON): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if ((args as string[]).includes("query"))
      return { stdout: JSON.stringify([{ oid: "42" }]), stderr: "" };
    if ((args as string[]).includes("screenshot"))
      return { stdout: screenshotOut, stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

describe("compareWithDesign", () => {
  it("calls screenshot screen when no locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await compareWithDesign({ figmaNodeUrl: FIGMA_URL, session: "com.test@1234" }, exec);
    const ssCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1].includes("screenshot"));
    expect(ssCall![1]).toContain("screen");
    expect(ssCall![1]).not.toContain("node");
  });

  it("queries node then screenshots by OID when locator provided", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await compareWithDesign({ figmaNodeUrl: FIGMA_URL, locator: "#button", session: "com.test@1234" }, exec);
    const queryCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1].includes("query"));
    const ssCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1].includes("screenshot"));
    expect(queryCall).toBeDefined();
    expect(ssCall![1]).toContain("node");
    expect(ssCall![1]).toContain("42"); // OID from query
  });

  it("returns screenshotPath and figmaNodeUrl", async () => {
    const exec = makeExec();
    const result = await compareWithDesign({ figmaNodeUrl: FIGMA_URL, session: "com.test@1234" }, exec);
    expect(result.screenshotPath).toBe("/tmp/viewglass-compare-test.png");
    expect(result.figmaNodeUrl).toBe(FIGMA_URL);
  });

  it("returns instructions for AI agent", async () => {
    const exec = makeExec();
    const result = await compareWithDesign({ figmaNodeUrl: FIGMA_URL, session: "com.test@1234" }, exec);
    expect(result.instructions).toContain("Figma MCP");
    expect(result.instructions).toContain("discrepancies");
  });

  it("throws when locator matches no nodes", async () => {
    const exec = vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
      if ((args as string[]).includes("query")) return { stdout: "[]", stderr: "" };
      return { stdout: "", stderr: "" };
    });
    await expect(
      compareWithDesign({ figmaNodeUrl: FIGMA_URL, locator: "#missing", session: "com.test@1234" }, exec)
    ).rejects.toThrow("matched 0 nodes");
  });
});
