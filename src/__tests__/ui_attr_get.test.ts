import { describe, it, expect, vi } from "vitest";
import { uiAttrGet } from "../tools/ui_attr_get.js";
import type { ExecFn } from "../runner.js";

function makeExec(stdout: string): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if ((args as string[]).includes("list"))
      return { stdout: JSON.stringify([{ bundleIdentifier: "com.test", port: 1234 }]), stderr: "" };
    return { stdout, stderr: "" };
  });
}

describe("uiAttrGet", () => {
  it("calls attr get <oid> --attr <keys> --json --session", async () => {
    const exec = makeExec('{"frame":{"x":0,"y":0,"width":100,"height":44}}') as ReturnType<typeof vi.fn>;
    await uiAttrGet({ oid: "9999", attrs: ["frame"], session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual([
      "attr", "get", "9999", "--attr", "frame", "--json", "--session", "com.test@1234",
    ]);
  });

  it("supports multiple attr keys", async () => {
    const exec = makeExec('{"frame":{},"backgroundColor":"#FFF"}') as ReturnType<typeof vi.fn>;
    await uiAttrGet({ oid: "9999", attrs: ["frame", "backgroundColor"], session: "com.test@1234" }, exec);
    const args = exec.mock.calls[0][1] as string[];
    expect(args).toContain("frame");
    expect(args).toContain("backgroundColor");
  });

  it("returns parsed attribute map", async () => {
    const attrMap = { frame: { x: 0, y: 100, width: 320, height: 44 }, text: "Hello" };
    const exec = makeExec(JSON.stringify(attrMap));
    const result = await uiAttrGet({ oid: "9999", attrs: ["frame", "text"], session: "com.test@1234" }, exec);
    expect(result).toEqual(attrMap);
  });

  it("throws on invalid JSON", async () => {
    const exec = makeExec("bad");
    await expect(uiAttrGet({ oid: "9999", attrs: ["frame"], session: "com.test@1234" }, exec))
      .rejects.toThrow("Failed to parse JSON");
  });
});
