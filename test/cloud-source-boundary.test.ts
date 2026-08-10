import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { evaluateCloudSourceBoundary } from "../src/analysis/cloud-source-boundary";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("evaluateCloudSourceBoundary", () => {
  it("allows a regular source contained by its real workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-source-root-"));
    temporaryDirectories.push(root);
    const sourceDirectory = path.join(root, "src");
    await mkdir(sourceDirectory);
    const filePath = path.join(sourceDirectory, "service.ts");
    await writeFile(filePath, "export const total = 1;");

    await expect(evaluateCloudSourceBoundary(filePath, root)).resolves.toEqual({
      allowed: true
    });
  });

  it("rejects a source file symlink", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-source-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "semantic-code-source-outside-"));
    temporaryDirectories.push(root, outside);
    const outsideFile = path.join(outside, "outside.ts");
    await writeFile(outsideFile, "export const privateValue = 1;");
    const linkedFile = path.join(root, "service.ts");
    await symlink(outsideFile, linkedFile);

    await expect(evaluateCloudSourceBoundary(linkedFile, root)).resolves.toMatchObject({
      allowed: false
    });
  });

  it("rejects a regular source reached through a directory symlink outside the workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-source-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "semantic-code-source-outside-"));
    temporaryDirectories.push(root, outside);
    await writeFile(path.join(outside, "outside.ts"), "export const privateValue = 1;");
    const linkedDirectory = path.join(root, "linked-src");
    await symlink(outside, linkedDirectory);

    await expect(
      evaluateCloudSourceBoundary(path.join(linkedDirectory, "outside.ts"), root)
    ).resolves.toMatchObject({ allowed: false });
  });

  it("allows an explicitly opened regular loose file", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-source-loose-"));
    temporaryDirectories.push(root);
    const filePath = path.join(root, "loose.ts");
    await writeFile(filePath, "export const value = 1;");

    await expect(evaluateCloudSourceBoundary(filePath)).resolves.toEqual({
      allowed: true
    });
  });
});
