import { describe, it, expect, vi } from "vitest";
import { uiScreenshot } from "../tools/ui_screenshot.js";
import type { ExecFn } from "../runner.js";

function makeExec(screenshotResult?: object): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    const result = screenshotResult ?? {
      path: "/tmp/viewglass-screenshot-123.png",
      width: 1170,
      height: 2532,
      dataSize: 12345,
      screenshotType: "screen",
    };
    return { stdout: JSON.stringify(result), stderr: "" };
  });
}

describe("uiScreenshot - full screen", () => {
  it("calls screenshot screen without locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScreenshot({ session: "com.test@1234" }, exec);
    const ssCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "screenshot");
    expect(ssCalls[0][1][1]).toBe("screen");
  });

  it("passes --output flag", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScreenshot({ session: "com.test@1234" }, exec);
    const ssCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "screenshot");
    expect(ssCalls[0][1]).toContain("--output");
  });

  it("returns path from CLI output", async () => {
    const exec = makeExec({
      path: "/tmp/test.png",
      width: 1170,
      height: 2532,
      screenshotType: "screen",
      captureProvider: "simctl",
      qualityWarnings: ["mostlyBlack"],
      blackPixelRatio: 0.95,
      nonBlackPixelRatio: 0.02,
    });
    const result = await uiScreenshot({ session: "com.test@1234" }, exec);
    expect(result.path).toBe("/tmp/test.png");
    expect(result.width).toBe(1170);
    expect(result.height).toBe(2532);
    expect(result.screenshotType).toBe("screen");
    expect(result.captureProvider).toBe("simctl");
    expect(result.qualityWarnings).toEqual(["mostlyBlack"]);
    expect(result.blackPixelRatio).toBe(0.95);
    expect(result.nonBlackPixelRatio).toBe(0.02);
  });

  it("uses custom outputPath when provided", async () => {
    const exec = makeExec({ path: "/custom/path.png" }) as ReturnType<typeof vi.fn>;
    await uiScreenshot({ outputPath: "/custom/path.png", session: "com.test@1234" }, exec);
    const ssCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "screenshot");
    expect(ssCalls[0][1]).toContain("/custom/path.png");
  });
});

describe("uiScreenshot - node", () => {
  it("calls screenshot node with locator", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScreenshot({ locator: "#header", session: "com.test@1234" }, exec);
    const ssCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "screenshot");
    expect(ssCalls[0][1][1]).toBe("node");
    expect(ssCalls[0][1]).toContain("#header");
  });

  it("returns locator in result", async () => {
    const exec = makeExec({ path: "/tmp/node.png" });
    const result = await uiScreenshot({ locator: "#header", session: "com.test@1234" }, exec);
    expect(result.locator).toBe("#header");
  });
});
