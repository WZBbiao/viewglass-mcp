import { describe, it, expect, vi } from "vitest";
import { uiScroll } from "../tools/ui_scroll.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if ((args as string[]).includes("hierarchy"))
      return { stdout: '{"windows":[]}', stderr: "" };
    return { stdout: "", stderr: "" };
  });
}

describe("uiScroll", () => {
  it("calls scroll with locator, --direction, session", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll");
    expect(scrollCall).toBeDefined();
    expect(scrollCall![1]).toContain("#feed");
    expect(scrollCall![1]).toContain("--direction");
    expect(scrollCall![1]).toContain("down");
  });

  it("appends --distance when provided", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", distance: 500, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("--distance");
    expect(scrollCall[1]).toContain("500");
  });

  it("appends --animated false when animated is false", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "up", animated: false, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("--animated");
    expect(scrollCall[1]).toContain("false");
  });

  it("omits --animated when not set to false", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).not.toContain("--animated");
  });

  it("returns scrolled locator, direction, and post-action hierarchy", async () => {
    const exec = makeExec();
    const result = await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    expect(result.scrolled).toBe("#feed");
    expect(result.direction).toBe("down");
    expect(result.hierarchy).toBeDefined();
  });
});
