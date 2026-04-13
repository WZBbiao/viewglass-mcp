import { describe, it, expect, vi } from "vitest";
import { uiInvoke } from "../tools/ui_invoke.js";
import type { ExecFn } from "../runner.js";

function makeExec(resultByCmd?: Record<string, object>): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    const cmd = args[0];
    const result = resultByCmd?.[cmd] ?? {};
    return { stdout: JSON.stringify(result), stderr: "" };
  });
}

describe("uiInvoke", () => {
  it("passes selector as first positional arg", async () => {
    const exec = makeExec({ invoke: { returnValue: null } }) as ReturnType<typeof vi.fn>;
    await uiInvoke({ selector: "setNeedsLayout", target: "#foo", session: "com.test@1234" }, exec);
    const invokeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "invoke");
    expect(invokeCalls.length).toBe(1);
    expect(invokeCalls[0][1][1]).toBe("setNeedsLayout");
  });

  it("passes --target arg", async () => {
    const exec = makeExec({ invoke: { returnValue: null } }) as ReturnType<typeof vi.fn>;
    await uiInvoke({ selector: "reloadData", target: "UITableView", session: "com.test@1234" }, exec);
    const invokeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "invoke");
    const cliArgs = invokeCalls[0][1];
    const targetIdx = cliArgs.indexOf("--target");
    expect(targetIdx).toBeGreaterThan(-1);
    expect(cliArgs[targetIdx + 1]).toBe("UITableView");
  });

  it("passes --arg for each argument", async () => {
    const exec = makeExec({ invoke: { returnValue: null } }) as ReturnType<typeof vi.fn>;
    await uiInvoke({
      selector: "setAlpha:",
      target: "#label",
      args: ["0.5"],
      session: "com.test@1234",
    }, exec);
    const invokeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "invoke");
    const cliArgs = invokeCalls[0][1];
    expect(cliArgs).toContain("--arg");
    expect(cliArgs[cliArgs.indexOf("--arg") + 1]).toBe("0.5");
  });

  it("passes multiple --arg flags for multi-param selectors", async () => {
    const exec = makeExec({ invoke: { returnValue: null } }) as ReturnType<typeof vi.fn>;
    await uiInvoke({
      selector: "setContentOffset:animated:",
      target: "#scroll",
      args: ["{0,100}", "true"],
      session: "com.test@1234",
    }, exec);
    const invokeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "invoke");
    const cliArgs = invokeCalls[0][1];
    const argIdxs = cliArgs.reduce<number[]>((acc, v, i) => (v === "--arg" ? [...acc, i] : acc), []);
    expect(argIdxs.length).toBe(2);
    expect(cliArgs[argIdxs[0] + 1]).toBe("{0,100}");
    expect(cliArgs[argIdxs[1] + 1]).toBe("true");
  });

  it("returns target, selector, args, and returnValue", async () => {
    const exec = makeExec({ invoke: { returnValue: "ok" } });
    const result = await uiInvoke({
      selector: "setNeedsLayout",
      target: "#root",
      session: "com.test@1234",
    }, exec);
    expect(result.target).toBe("#root");
    expect(result.selector).toBe("setNeedsLayout");
    expect(result.args).toEqual([]);
    expect(result.returnValue).toBe("ok");
  });

  it("returns args array in result", async () => {
    const exec = makeExec({ invoke: {} });
    const result = await uiInvoke({
      selector: "setAlpha:",
      target: "UIView",
      args: ["0.3"],
      session: "com.test@1234",
    }, exec);
    expect(result.args).toEqual(["0.3"]);
  });

  it("passes --json flag", async () => {
    const exec = makeExec({ invoke: {} }) as ReturnType<typeof vi.fn>;
    await uiInvoke({ selector: "reloadData", target: "UITableView", session: "com.test@1234" }, exec);
    const invokeCalls = (exec.mock.calls as [string, string[]][]).filter((c) => c[1][0] === "invoke");
    expect(invokeCalls[0][1]).toContain("--json");
  });
});
