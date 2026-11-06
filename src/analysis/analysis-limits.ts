export function effectiveRegionLimit(
  configuredLimit: number,
  provider: "agent" | "local" | "openai"
): number {
  return provider === "openai"
    ? Math.min(configuredLimit, 400)
    : configuredLimit;
}

