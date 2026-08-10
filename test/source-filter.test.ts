import { describe, expect, it } from "vitest";

import { DefaultSourceFilter } from "../src/analysis/source-filter";

describe("DefaultSourceFilter", () => {
  const filter = new DefaultSourceFilter(1024);

  it.each([
    ["/repo/.env.production", "TOKEN=value"],
    ["/repo/node_modules/pkg/index.ts", "export const value = 1"],
    ["/repo/dist/app.js", "console.log('built')"],
    ["/repo/certs/client.pem", "certificate"],
    ["/repo/src/client.generated.ts", "// generated"],
    ["/repo/src/key.ts", "-----BEGIN PRIVATE KEY-----\nsecret"]
  ])("blocks protected source %s", (filePath, source) => {
    expect(filter.evaluate(filePath, source).allowed).toBe(false);
  });

  it("allows ordinary supported source", () => {
    expect(filter.evaluate("/repo/src/order-service.ts", "export function placeOrder() {}"))
      .toEqual({ allowed: true });
  });

  it("blocks files over the configured byte limit", () => {
    expect(filter.evaluate("/repo/src/large.ts", "x".repeat(1025)).allowed).toBe(false);
  });
});

