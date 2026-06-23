export type DeviceType = "device" | "simulator";

export type RunningApp = {
  bundleIdentifier: string;
  port: number;
  deviceType?: DeviceType | string;
  deviceName?: string;
  deviceIdentifier?: string;
  serverVersion?: string;
};

export type SessionSelector = {
  session?: string;
  port?: number;
  deviceType?: DeviceType;
  deviceName?: string;
  deviceIdentifier?: string;
};

export function sessionOf(app: RunningApp): string {
  return `${app.bundleIdentifier}@${app.port}`;
}

export function parseSession(value?: string): { bundleId: string; port: number } | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  const at = trimmed.lastIndexOf("@");
  if (at <= 0 || at === trimmed.length - 1) return undefined;
  const port = Number(trimmed.slice(at + 1));
  if (!Number.isInteger(port)) return undefined;
  return { bundleId: trimmed.slice(0, at), port };
}

export function matchingBundleCandidates(
  apps: RunningApp[],
  bundleId: string
): { candidates: RunningApp[]; matchKind: "exact" | "partial" | "none" } {
  const normalized = bundleId.trim().toLowerCase();
  const exact = apps.filter((app) => app.bundleIdentifier === bundleId);
  if (exact.length > 0) return { candidates: exact, matchKind: "exact" };

  const partial = apps.filter((app) => app.bundleIdentifier.toLowerCase().includes(normalized));
  return { candidates: partial, matchKind: partial.length > 0 ? "partial" : "none" };
}

export function isSameBundleTarget(requestedBundleId: string, configuredBundleId?: string): boolean {
  const configured = configuredBundleId?.trim().toLowerCase();
  if (!configured) return false;

  const requested = requestedBundleId.trim().toLowerCase();
  return configured === requested || configured.includes(requested) || requested.includes(configured);
}

export function applySessionSelectors(
  apps: RunningApp[],
  selectors: SessionSelector
): { candidates: RunningApp[]; appliedSelectors: string[] } {
  let candidates = apps;
  const appliedSelectors: string[] = [];

  if (selectors.session?.trim()) {
    const session = selectors.session.trim();
    candidates = candidates.filter((app) => sessionOf(app) === session);
    appliedSelectors.push(`session=${session}`);
  }
  if (selectors.port !== undefined) {
    candidates = candidates.filter((app) => app.port === selectors.port);
    appliedSelectors.push(`port=${selectors.port}`);
  }
  if (selectors.deviceIdentifier?.trim()) {
    const deviceIdentifier = selectors.deviceIdentifier.trim();
    candidates = candidates.filter((app) => app.deviceIdentifier === deviceIdentifier);
    appliedSelectors.push(`deviceIdentifier=${deviceIdentifier}`);
  }
  if (selectors.deviceName?.trim()) {
    const deviceName = selectors.deviceName.trim();
    candidates = candidates.filter((app) => app.deviceName === deviceName);
    appliedSelectors.push(`deviceName=${deviceName}`);
  }
  if (selectors.deviceType) {
    candidates = candidates.filter((app) => app.deviceType === selectors.deviceType);
    appliedSelectors.push(`deviceType=${selectors.deviceType}`);
  }

  return { candidates, appliedSelectors };
}

export function hasAnySessionSelector(selectors: SessionSelector): boolean {
  return Boolean(
    selectors.session?.trim() ||
      selectors.port !== undefined ||
      selectors.deviceType ||
      selectors.deviceName?.trim() ||
      selectors.deviceIdentifier?.trim()
  );
}

export function selectByConfigFallback(
  apps: RunningApp[],
  selectors: SessionSelector
): { candidates: RunningApp[]; appliedSelectors: string[] } {
  const tiers: SessionSelector[] = [
    compactSelectors({ deviceIdentifier: selectors.deviceIdentifier }),
    compactSelectors({ deviceType: selectors.deviceType, deviceName: selectors.deviceName }),
    compactSelectors({ deviceType: selectors.deviceType }),
    compactSelectors({ deviceName: selectors.deviceName }),
    compactSelectors({ session: selectors.session }),
    compactSelectors({ port: selectors.port }),
  ].filter(hasAnySessionSelector);

  for (const tier of tiers) {
    const result = applySessionSelectors(apps, tier);
    if (result.candidates.length === 1) {
      return result;
    }
  }

  return { candidates: apps, appliedSelectors: [] };
}

export function compactSelectors(selectors: SessionSelector): SessionSelector {
  return {
    ...(selectors.session?.trim() ? { session: selectors.session.trim() } : {}),
    ...(selectors.port !== undefined ? { port: selectors.port } : {}),
    ...(selectors.deviceType ? { deviceType: selectors.deviceType } : {}),
    ...(selectors.deviceName?.trim() ? { deviceName: selectors.deviceName.trim() } : {}),
    ...(selectors.deviceIdentifier?.trim() ? { deviceIdentifier: selectors.deviceIdentifier.trim() } : {}),
  };
}

export function formatAppCandidate(app: RunningApp): string {
  const details = [
    app.deviceType,
    app.deviceName,
    app.deviceIdentifier,
    `port:${app.port}`,
    app.serverVersion ? `server:${app.serverVersion}` : undefined,
  ]
    .filter(Boolean)
    .join("/");
  return details ? `${sessionOf(app)} (${details})` : sessionOf(app);
}

export function formatAppCandidates(apps: RunningApp[]): string {
  if (apps.length === 0) return "none";
  return apps.map(formatAppCandidate).join(", ");
}
