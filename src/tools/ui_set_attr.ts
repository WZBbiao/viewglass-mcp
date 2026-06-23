import { runCLI, resolveSession } from "../runner.js";
import type { ExecFn } from "../runner.js";
import { resolveUniqueNodeLocator } from "./locator.js";

export interface UISetAttrInput {
  /** Node OID obtained from ui_snapshot. */
  oid?: string;
  /** Locator resolved by the CLI (preferred for stable E2E and agent flows). */
  locator?: string;
  /** Attribute key to set (e.g. "backgroundColor", "alpha", "hidden", "text"). */
  attr: string;
  /**
   * New value as a string. Examples:
   *  - backgroundColor: "#FF0000"
   *  - alpha: "0.5"
   *  - hidden: "true" / "false"
   *  - text: "Hello"
   */
  value: string;
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
}

/**
 * Set an attribute on a UI node at runtime. Mutations are live — the app
 * UI changes immediately without recompile. Use for visual debugging and
 * design verification (e.g. tweak colors/fonts to match design spec).
 *
 * WARNING: Changes are ephemeral — they reset on next app launch.
 */
export async function uiSetAttr(
  input: UISetAttrInput,
  exec?: ExecFn
): Promise<{
  oid?: string;
  locator?: string;
  resolvedOid?: string;
  matchedBy?: string;
  candidateCount?: number;
  attr: string;
  value: string;
  ok: true;
}> {
  const session = await resolveSession(input.session, exec);
  if (!input.locator && !input.oid) {
    throw new Error("ui_set_attr requires either 'oid' or 'locator'");
  }
  const resolved = input.locator
    ? await resolveUniqueNodeLocator(input.locator, session, exec)
    : undefined;
  const target = resolved?.resolvedTarget ?? input.oid!;
  const cliAttr = normalizeCLIAttr(input.attr);
  // CLI syntax: attr set <target> <key> <value> [--session <s>]
  await runCLI(["attr", "set", target, cliAttr, input.value], {
    session,
    exec,
    timeoutMs: 30_000,
  });
  const output: {
    oid?: string;
    locator?: string;
    resolvedOid?: string;
    matchedBy?: string;
    candidateCount?: number;
    attr: string;
    value: string;
    ok: true;
  } = {
    oid: input.oid,
    locator: input.locator,
    attr: input.attr,
    value: input.value,
    ok: true,
  };
  if (resolved) {
    output.resolvedOid = resolved.resolvedTarget;
    output.matchedBy = resolved.matchedBy;
    output.candidateCount = resolved.candidateCount;
  }
  return output;
}

function normalizeCLIAttr(attr: string): string {
  // Viewglass hierarchy exposes effective visibility through opacity. Treat
  // alpha as the public alias agents expect, but write the stable runtime key.
  return attr.trim().toLocaleLowerCase() === "alpha" ? "opacity" : attr;
}
