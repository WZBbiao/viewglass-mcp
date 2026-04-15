import { describe, it, expect, vi } from "vitest";
import { uiQuery } from "../tools/ui_query.js";
import type { ExecFn } from "../runner.js";

function makeExec(handler?: (args: string[]) => string): ExecFn {
  return vi.fn().mockImplementation(async (_file: string, args: string[]) => {
    if (args.includes("list")) {
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    }
    const stdout = handler ? handler(args) : "[]";
    return { stdout, stderr: "" };
  });
}

describe("uiQuery", () => {
  it("tries plain locator resolution in fixed order", async () => {
    const exec = makeExec((args) => {
      const expr = args[1];
      if (expr === "#submit") return "[]";
      if (expr === "submit") return "[]";
      if (expr === 'contains:"submit"') return JSON.stringify([{ oid: 1 }]);
      return "[]";
    }) as ReturnType<typeof vi.fn>;

    await uiQuery({ locator: "submit", session: "com.test@1234" }, exec);

    expect(exec.mock.calls[0][1]).toEqual(["query", "#submit", "--json", "--session", "com.test@1234"]);
    expect(exec.mock.calls[1][1]).toEqual(["query", "submit", "--json", "--session", "com.test@1234"]);
    expect(exec.mock.calls[2][1]).toEqual(["query", 'contains:"submit"', "--json", "--session", "com.test@1234"]);
  });

  it("returns first non-empty match set", async () => {
    const exec = makeExec((args) => {
      const expr = args[1];
      if (expr === "#submit") return JSON.stringify([{ oid: 1 }, { oid: 2 }]);
      return "[]";
    });

    const result = await uiQuery({ locator: "submit", session: "com.test@1234" }, exec);
    expect(result).toEqual([{ oid: 1 }, { oid: 2 }]);
  });

  it("returns empty array when all strategies miss", async () => {
    const exec = makeExec(() => "[]");
    const result = await uiQuery({ locator: "missing", session: "com.test@1234" }, exec);
    expect(result).toEqual([]);
  });

  it("throws on invalid JSON", async () => {
    const exec = makeExec(() => "not json");
    await expect(uiQuery({ locator: "x", session: "com.test@1234" }, exec)).rejects.toThrow(
      "Failed to parse JSON from 'locator/query'"
    );
  });
});
