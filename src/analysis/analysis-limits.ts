export function effectiveRegionLimit(
  configuredLimit: number,
  provider: "local" | "openai"
): number {
  return provider === "openai"
    ? Math.min(configuredLimit, 400)
    : configuredLimit;
}

