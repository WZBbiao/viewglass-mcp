import { describe, it, expect, vi } from "vitest";
import { uiSetAttr } from "../tools/ui_set_attr.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#primary_text_field" || args[1] === "#push_buttons_screen") {
        return { stdout: JSON.stringify([{ oid: 5678, primaryOid: 5678 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "hierarchy") {
      return {
        stdout: JSON.stringify({
          appInfo: { appName: "FixtureApp", bundleIdentifier: "com.test", serverVersion: "0.1.0" },
          fetchedAt: "2026-04-15T10:00:00Z",
          screenScale: 3,
          screenSize: { x: 0, y: 0, width: 390, height: 844 },
          snapshotId: "snap-set-attr",
          windows: [],
        }),
        stderr: "",
      };
    }
    return { stdout: "", stderr: "" };
  });
}

describe("uiSetAttr", () => {
  it("calls attr set <oid> <key> <value> --session (positional, no --attr flag)", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiSetAttr({ oid: "5678", attr: "backgroundColor", value: "#FF0000", session: "com.test@1234" }, exec);
    expect(exec.mock.calls[0][1]).toEqual([
      "attr", "set", "5678", "backgroundColor", "#FF0000", "--session", "com.test@1234",
    ]);
  });

  it("returns confirmation with oid, attr, value, ok:true", async () => {
    const exec = makeExec();
    const result = await uiSetAttr({ oid: "5678", attr: "alpha", value: "0.5", session: "com.test@1234" }, exec);
    expect(result).toEqual({ oid: "5678", attr: "alpha", value: "0.5", ok: true });
  });

  it("supports locator targets and returns locator in confirmation", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiSetAttr({
      locator: "primary_text_field",
      attr: "alpha",
      value: "0.8",
      session: "com.test@1234",
    }, exec);
    const attrSetCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "attr");
    expect(attrSetCall?.[1]).toEqual([
      "attr", "set", "5678", "alpha", "0.8", "--session", "com.test@1234",
    ]);
    expect(result).toEqual({
      locator: "primary_text_field",
      attr: "alpha",
      value: "0.8",
      ok: true,
    });
  });

  it("propagates CLI errors", async () => {
    const exec = vi.fn().mockRejectedValue(new Error("node not found"));
    await expect(uiSetAttr({ oid: "bad", attr: "text", value: "x", session: "com.test@1234" }, exec as ExecFn))
      .rejects.toThrow("node not found");
  });

  it("requires either oid or locator", async () => {
    const exec = makeExec();
    await expect(uiSetAttr({ attr: "text", value: "x", session: "com.test@1234" }, exec))
      .rejects.toThrow("ui_set_attr requires either 'oid' or 'locator'");
  });
});
