import { describe, it, expect, vi } from "vitest";
import { uiScroll } from "../tools/ui_scroll.js";
import type { ExecFn } from "../runner.js";

function makeExec(): ExecFn {
  return vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
    if (args[0] === "query") {
      if (args[1] === "#long_feed_scroll") {
        return { stdout: JSON.stringify([{ oid: 88, primaryOid: 88 }]), stderr: "" };
      }
      return { stdout: "[]", stderr: "" };
    }
    if (args[0] === "swipe") {
      return { stdout: JSON.stringify({ targetClass: "UITableView" }), stderr: "" };
    }
    return { stdout: "", stderr: "" };
  });

  it("resolves locator before scrolling", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    const result = await uiScroll({ locator: "long_feed_scroll", direction: "down", session: "com.test@1234" }, exec);
    const swipeCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "swipe")!;
    expect(swipeCall[1]).toContain("88");
    expect(result).toEqual(expect.objectContaining({
      oid: "88",
      locator: "long_feed_scroll",
      matchedBy: "query fallback",
      candidateCount: 1,
    }));
  });
}

describe("uiScroll", () => {
  it("calls swipe with oid and uses the default down distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "down", session: "com.test@1234" }, exec);
    const swipeCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "swipe")!;
    expect(swipeCall[1]).toEqual([
      "swipe", "88", "--direction", "up", "--distance", "300", "--json", "--animated", "--session", "com.test@1234",
    ]);
  });

  it("uses a 30s process timeout for scroll swipe mutations", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "down", session: "com.test@1234" }, exec);
    const swipeCall = exec.mock.calls.find((c) => c[1][0] === "swipe");
    expect(swipeCall?.[2]).toEqual({ timeout: 30_000 });
  });

  it("passes custom direction and distance", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "up", distance: 500, session: "com.test@1234" }, exec);
    const swipeCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "swipe")!;
    expect(swipeCall[1]).toContain("down");
    expect(swipeCall[1]).toContain("500");
  });

  it("omits --animated when explicitly disabled", async () => {
    const exec = makeExec() as ReturnType<typeof vi.fn>;
    await uiScroll({ oid: "88", direction: "down", animated: false, session: "com.test@1234" }, exec);
    const swipeCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "swipe")!;
    expect(swipeCall[1]).not.toContain("--animated");
  });

  it("returns execution summary only", async () => {
    const exec = makeExec();
    const result = await uiScroll({ oid: "88", direction: "down", session: "com.test@1234" }, exec);
    expect(result.ok).toBe(true);
    expect(result.oid).toBe("88");
    expect(result.direction).toBe("down");
    expect(result.distance).toBe(300);
    expect(result.strategyUsed).toBe("swipe");
  });

  it("resolves wrapper nodes to descendant scroll views with contentOffset", async () => {
    const exec = vi.fn().mockImplementation(async (_bin: string, args: string[]) => {
      if (args[0] === "hierarchy") {
        return {
          stdout: JSON.stringify({
            windows: [
              {
                node: {
                  oid: 1,
                  primaryOid: 1,
                  className: "UIWindow",
                  frame: { x: 0, y: 0, width: 390, height: 844 },
                  bounds: { x: 0, y: 0, width: 390, height: 844 },
                  isHidden: false,
                  alpha: 1,
                },
                children: [
                  {
                    node: {
                      oid: 10,
                      primaryOid: 10,
                      className: "TapTap.WrapperCell",
                      frame: { x: 0, y: 0, width: 390, height: 600 },
                      bounds: { x: 0, y: 0, width: 390, height: 600 },
                      isHidden: false,
                      alpha: 1,
                      parentOid: 1,
                    },
                    children: [
                      {
                        node: {
                          oid: 20,
                          primaryOid: 20,
                          viewOid: 20,
                          className: "UITableView",
                          frame: { x: 0, y: 0, width: 390, height: 600 },
                          bounds: { x: 0, y: 0, width: 390, height: 600 },
                          isHidden: false,
                          alpha: 1,
                          parentOid: 10,
                          attributeGroups: [
                            { attributes: [{ key: "contentOffset", value: { string: { _0: "NSPoint: {0, 0}" } } }] },
                          ],
                        },
                        children: [],
                      },
                    ],
                  },
                ],
              },
            ],
          }),
          stderr: "",
        };
      }
      if (args[0] === "swipe") return { stdout: JSON.stringify({ targetClass: "UITableView" }), stderr: "" };
      return { stdout: "", stderr: "" };
    }) as unknown as ReturnType<typeof vi.fn> & ExecFn;

    const result = await uiScroll({ oid: "10", direction: "down", session: "com.test@1234" }, exec);
    const swipeCall = (exec.mock.calls as [string, string[]][]).find((c) => c[1][0] === "swipe")!;
    expect(swipeCall[1]).toContain("20");
    expect(result.resolvedOid).toBe("20");
    expect(result.targetClass).toBe("UITableView");
  });

  it("rejects missing target", async () => {
    const exec = makeExec();
    await expect(uiScroll({ direction: "down", session: "com.test@1234" }, exec)).rejects.toThrow(
      "ui_scroll requires either 'locator' or 'oid'"
    );
  });
});
