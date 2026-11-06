type Cart = { member: boolean; items: { sku: string; cents: number; count: number }[] };
type Port = Pick<typeof import("node:fs/promises"), "writeFile">;
type Hooks = { on: (event: string, handler: (raw: string) => unknown) => void };

export function setup(hooks: Hooks) {
  hooks.on("message", raw => JSON.parse(raw));
}

export async function run(raw: string, port: Port) {
  const input: Cart = JSON.parse(raw);
  if (!Array.isArray(input.items) || input.items.length === 0) throw new Error("Empty cart");
  const amount = format(input);
  const ids = input.items.map(item => item.sku.toUpperCase());
  await helper(port, JSON.stringify({ ids, amount }));
  return JSON.stringify({ accepted: true, amount });
}

function format(value: Cart) {
  const subtotal = value.items.reduce((sum, item) => sum + item.cents * item.count, 0);
  return value.member ? Math.round(subtotal * 0.9) : subtotal;
}

export const STATUS = { pending: 0, accepted: 1 } as const;

async function helper(destination: Port, text: string) {
  await destination.writeFile("orders.json", text);
}

export function inspect(raw: string) {
  const parsed: unknown = JSON.parse(raw);
  if (typeof parsed !== "object" || parsed === null) throw new Error("Expected object");
  return parsed;
}

export function later(work: () => void, milliseconds: number) {
  return setTimeout(work, milliseconds);
}

export function opaque(plugin: (value: unknown) => unknown, value: unknown) {
  return plugin(value);
}
