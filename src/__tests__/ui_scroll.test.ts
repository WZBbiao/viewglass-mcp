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
  it("calls scroll with --by 0,300 for direction=down", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("#feed");
    expect(scrollCall[1]).toContain("--by");
    expect(scrollCall[1]).toContain("0,300");
  });

  it("calls scroll with --by 0,-300 for direction=up", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "up", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("0,-300");
  });

  it("uses custom distance in --by arg", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", distance: 500, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("0,500");
  });

  it("appends --animated flag (not value) when animated=true", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", animated: true, session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).toContain("--animated");
    // --animated is a boolean flag, not followed by a value
    const idx = scrollCall[1].indexOf("--animated");
    expect(scrollCall[1][idx + 1]).not.toBe("false");
    expect(scrollCall[1][idx + 1]).not.toBe("true");
  });

  it("omits --animated when animated is false or undefined", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    const scrollCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "scroll")!;
    expect(scrollCall[1]).not.toContain("--animated");
  });

  it("returns scrolled, direction, and post-action hierarchy", async () => {
    const exec = makeExec();
    const result = await uiScroll({ locator: "#feed", direction: "down", session: "com.test@1234" }, exec);
    expect(result.scrolled).toBe("#feed");
    expect(result.direction).toBe("down");
    expect(result.hierarchy).toBeDefined();
  });
});
