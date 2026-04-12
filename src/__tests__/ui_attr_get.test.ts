import { describe, it, expect, vi } from "vitest";
import { uiAttrGet } from "../tools/ui_attr_get.js";
import type { ExecFn } from "../runner.js";

const ALL_ATTRS = { frame: "NSRect: {{0,0},{100,44}}", alpha: 1, hidden: false, text: "Hello" };

function makeExec(attrs = ALL_ATTRS): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if ((args as string[]).includes("list"))
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout: JSON.stringify({ attributes: attrs }), stderr: "" };
  });
}

describe("uiAttrGet", () => {
  it("calls attr get <oid> --json --session (no --attr flag)", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiAttrGet({ oid: "9999", attrs: ["frame"], session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual([
      "attr", "get", "9999", "--json", "--session", "com.test@1234",
    ]);
  });

  it("returns only requested attrs when attrs specified", async () => {
    const exec = makeExec();
    const result = await uiAttrGet({ oid: "9999", attrs: ["frame", "alpha"], session: "com.test@1234" }, exec);
    expect(Object.keys(result).sort()).toEqual(["alpha", "frame"]);
    expect(result.frame).toBe(ALL_ATTRS.frame);
  });

  it("returns all attrs when attrs not specified", async () => {
    const exec = makeExec();
    const result = await uiAttrGet({ oid: "9999", session: "com.test@1234" }, exec);
    expect(Object.keys(result).length).toBe(4);
  });

  it("returns empty object when no requested attrs exist", async () => {
    const exec = makeExec();
    const result = await uiAttrGet({ oid: "9999", attrs: ["nonexistent"], session: "com.test@1234" }, exec);
    expect(result).toEqual({});
  });

  it("throws on invalid JSON", async () => {
    const exec = vi.fn().mockResolvedValue({ stdout: "bad", stderr: "" });
    await expect(uiAttrGet({ oid: "9999", session: "com.test@1234" }, exec as ExecFn))
      .rejects.toThrow("Failed to parse JSON");
  });
});
