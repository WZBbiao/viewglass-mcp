import { runCLI, resolveSession, parseJSON } from "../runner.js";
import type { ExecFn } from "../runner.js";

export interface UISnapshotInput {
  /** Viewglass session in bundleId@port format. Auto-detected if omitted. */
  session?: string;
  /** Filter hierarchy to nodes of this UIKit class name (e.g. UILabel, UIButton). */
  filter?: string;
  /**
   * Return compact hierarchy (oid, class, label, frame only). Default: true.
   * Set to false to get the full hierarchy with all node metadata.
   */
  compact?: boolean;
}

/**
 * Capture a UI hierarchy snapshot from the running app.
 * Returns compact JSON by default (oid/class/label/frame); set compact=false for full metadata.
 */
export async function uiSnapshot(
  input: UISnapshotInput,
  exec?: ExecFn
): Promise<unknown> {
  const session = await resolveSession(input.session, exec);
  const compact = input.compact !== false;
  const args = ["hierarchy", "--json"];
  if (compact) args.push("--compact");
  if (input.filter) args.push("--filter", input.filter);
  const { stdout } = await runCLI(args, { session, exec });
  return parseJSON(stdout, "ui_snapshot");
}
