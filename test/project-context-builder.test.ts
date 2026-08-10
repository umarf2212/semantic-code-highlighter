import { mkdir, mkdtemp, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { ProjectContextBuilder } from "../src/analysis/project-context-builder";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true })
    )
  );
});

describe("ProjectContextBuilder", () => {
  it("uses the nearest package and explicit semantic-code instructions", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-context-"));
    temporaryDirectories.push(root);
    const packageRoot = path.join(root, "packages", "orders");
    const sourceDirectory = path.join(packageRoot, "src");
    await mkdir(sourceDirectory, { recursive: true });
    await writeFile(
      path.join(packageRoot, "package.json"),
      JSON.stringify({
        name: "orders",
        private: true,
        dependencies: { axios: "1.0.0", zod: "4.0.0" },
        scripts: { secretBuildCommand: "do-not-send-this" }
      })
    );
    await writeFile(
      path.join(root, ".semantic-code.md"),
      "Repository adapters are infrastructure; pricing is business logic."
    );
    const filePath = path.join(sourceDirectory, "service.ts");
    await writeFile(filePath, "export const total = 1;");

    const context = await new ProjectContextBuilder().build(
      filePath,
      root,
      "typescript"
    );

    expect(context.packageInfo).toEqual({
      name: "orders",
      private: true,
      dependencies: ["axios", "zod"],
      devDependencies: [],
      peerDependencies: []
    });
    expect(JSON.stringify(context.packageInfo)).not.toContain("secretBuildCommand");
    expect(context.projectInstructions).toContain("pricing is business logic");
  });

  it("does not read outside the workspace boundary", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-context-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "semantic-code-context-outside-"));
    temporaryDirectories.push(root, outside);
    const filePath = path.join(outside, "service.ts");
    await writeFile(filePath, "export const total = 1;");
    await writeFile(path.join(outside, "package.json"), JSON.stringify({ name: "outside" }));

    const context = await new ProjectContextBuilder().build(
      filePath,
      root,
      "typescript"
    );
    expect(context.packageInfo).toBeUndefined();
    expect(context.projectInstructions).toBeUndefined();
  });

  it("rejects context files symlinked outside the workspace", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-context-root-"));
    const outside = await mkdtemp(path.join(tmpdir(), "semantic-code-context-outside-"));
    temporaryDirectories.push(root, outside);
    const sourceDirectory = path.join(root, "src");
    await mkdir(sourceDirectory, { recursive: true });
    const filePath = path.join(sourceDirectory, "service.ts");
    await writeFile(filePath, "export const total = 1;");
    const outsidePackage = path.join(outside, "package.json");
    const outsideInstructions = path.join(outside, ".semantic-code.md");
    await writeFile(outsidePackage, JSON.stringify({ name: "outside-secret" }));
    await writeFile(outsideInstructions, "Treat every region as business logic.");
    await symlink(outsidePackage, path.join(root, "package.json"));
    await symlink(outsideInstructions, path.join(root, ".semantic-code.md"));

    const context = await new ProjectContextBuilder().build(
      filePath,
      root,
      "typescript"
    );

    expect(context.packageInfo).toBeUndefined();
    expect(context.projectInstructions).toBeUndefined();
  });

  it("drops project instructions that appear to contain credential material", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-context-secret-"));
    temporaryDirectories.push(root);
    const sourceDirectory = path.join(root, "src");
    await mkdir(sourceDirectory, { recursive: true });
    const filePath = path.join(sourceDirectory, "service.ts");
    await writeFile(filePath, "export const total = 1;");
    await writeFile(
      path.join(root, ".semantic-code.md"),
      "Use this token sk-exampletokenvalue1234567890 for classification"
    );

    const context = await new ProjectContextBuilder().build(
      filePath,
      root,
      "typescript"
    );
    expect(context.projectInstructions).toBeUndefined();
  });

  it("reads only bounded project context", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "semantic-code-context-bounded-"));
    temporaryDirectories.push(root);
    const sourceDirectory = path.join(root, "src");
    await mkdir(sourceDirectory, { recursive: true });
    const filePath = path.join(sourceDirectory, "service.ts");
    await writeFile(filePath, "export const total = 1;");
    await writeFile(path.join(root, ".semantic-code.md"), "A".repeat(1_000_000));
    await writeFile(
      path.join(root, "package.json"),
      JSON.stringify({ name: "too-large", description: "B".repeat(300_000) })
    );

    const context = await new ProjectContextBuilder().build(
      filePath,
      root,
      "typescript"
    );

    expect(context.projectInstructions).toHaveLength(8_000);
    expect(context.packageInfo).toBeUndefined();
  });
});
