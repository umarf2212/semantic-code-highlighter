export function colorWithOpacity(hex: string, opacity: number): string {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(hex);
  if (match === null) {
    return `rgba(97, 97, 97, ${clampOpacity(opacity)})`;
  }
  const red = Number.parseInt(match[1] ?? "61", 16);
  const green = Number.parseInt(match[2] ?? "61", 16);
  const blue = Number.parseInt(match[3] ?? "61", 16);
  return `rgba(${red}, ${green}, ${blue}, ${clampOpacity(opacity)})`;
}

function clampOpacity(value: number): number {
  return Math.min(1, Math.max(0, value));
}

