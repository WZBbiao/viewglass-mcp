import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UIInvokeInput {
  /**
   * ObjC selector to invoke.
   * No-arg: "setNeedsLayout", "reloadData"
   * With args: "setAlpha:" (one colon per arg), "scrollToRow:atScrollPosition:animated:"
   */
  selector: string;
  /**
   * Target locator: '#accessibilityIdentifier', class name, or OID.
   * The method is dispatched on the node's underlying UIView (or its view controller for
   * UIViewController methods).
   */
  target: string;
  /**
   * Argument values in order. Supported types:
   *  - Number: "0.5", "42"
   *  - Bool: "true" / "false" / "YES" / "NO"
   *  - String: any other value
   *  - CGPoint/CGSize/CGRect structs: "{x,y}", "{{x,y},{w,h}}"
   *  - nil: "nil"
   */
  args?: string[];
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

export interface UIInvokeResult {
  /** Target locator used. */
  target: string;
  /** Selector that was invoked. */
  selector: string;
  /** Arguments that were passed. */
  args: string[];
  /** Return value from the method (if any), as a string. May be null/undefined. */
  returnValue?: unknown;
}

/**
 * Invoke any ObjC selector on a UI node at runtime.
 *
 * This is the highest-leverage tool — it lets you call ANY method on any element:
 *  - Layout: setNeedsLayout, layoutIfNeeded
 *  - Data: reloadData, reloadSections:withRowAnimation:
 *  - Navigation: popViewControllerAnimated:, dismissViewControllerAnimated:completion:
 *  - Animation: setAlpha:, setHidden:, setTransform:
 *  - Custom: any selector exposed by the app's own classes
 *
 * Returns { target, selector, args, returnValue }.
 * returnValue is the ObjC return value as string (may be null for void methods).
 */
export async function uiInvoke(
  input: UIInvokeInput,
  exec?: ExecFn
): Promise<UIInvokeResult> {
  const session = await resolveSession(input.session, exec);
  const args = input.args ?? [];

  const cliArgs = ["invoke", input.selector, "--target", input.target, "--json"];
  for (const a of args) {
    cliArgs.push("--arg", a);
  }

  const { stdout } = await runCLI(cliArgs, { session, exec });
  const raw = parseJSON<{ returnValue?: unknown; result?: unknown }>(stdout, "ui_invoke");

  return {
    target: input.target,
    selector: input.selector,
    args,
    returnValue: raw.returnValue ?? raw.result ?? null,
  };
}
