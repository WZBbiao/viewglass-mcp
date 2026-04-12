import { describe, it, expect, vi } from "vitest";
import { uiQuery } from "../tools/ui_query.js";
import type { ExecFn } from "../runner.js";

function makeExec(stdout: string, error?: Error): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (error) throw error;
    if ((args as string[]).includes("list"))
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout, stderr: "" };
  });
}

const node = { oid: "1234", className: "UIButton", frame: { x: 0, y: 0, width: 100, height: 44 } };

describe("uiQuery", () => {
  it("calls query <locator> --json with session", async () => {
    const exec = makeExec(JSON.stringify([node])) as ReturnType<typeof vi.fn>;
    await uiQuery({ locator: "#submit", session: "com.test@1234" }, exec);
    const call = exec.mock.calls[0] as [string, string[]];
    expect(call[1]).toEqual(["query", "#submit", "--json", "--session", "com.test@1234"]);
  });

  it("returns array of nodes", async () => {
    const exec = makeExec(JSON.stringify([node]));
    const result = await uiQuery({ locator: "#submit", session: "com.test@1234" }, exec);
    expect(result).toEqual([node]);
  });

  it("normalizes single object response to array", async () => {
    const exec = makeExec(JSON.stringify(node));
    const result = await uiQuery({ locator: "#submit", session: "com.test@1234" }, exec);
    expect(result).toEqual([node]);
  });

  it("returns empty array when CLI returns []", async () => {
    const exec = makeExec("[]");
    const result = await uiQuery({ locator: "#missing", session: "com.test@1234" }, exec);
    expect(result).toEqual([]);
  });

  it("throws on invalid JSON", async () => {
    const exec = makeExec("not json");
    await expect(uiQuery({ locator: "#x", session: "com.test@1234" }, exec)).rejects.toThrow(
      "Failed to parse JSON from 'ui_query'"
    );
  });
});
