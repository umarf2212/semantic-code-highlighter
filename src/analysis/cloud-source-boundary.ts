import { lstat, realpath } from "node:fs/promises";
import path from "node:path";

export interface CloudSourceBoundaryDecision {
  allowed: boolean;
  reason?: string;
}

export async function evaluateCloudSourceBoundary(
  filePath: string,
  workspaceRoot?: string
): Promise<CloudSourceBoundaryDecision> {
  try {
    const sourceStats = await lstat(filePath);
    if (!sourceStats.isFile() || sourceStats.isSymbolicLink()) {
      return blocked("OpenAI analysis does not follow symlinked source files.");
    }

    if (workspaceRoot === undefined) {
      return { allowed: true };
    }

    const [resolvedSource, resolvedRoot] = await Promise.all([
      realpath(filePath),
      realpath(workspaceRoot)
    ]);
    if (!isWithin(resolvedSource, resolvedRoot)) {
      return blocked("The source resolves outside its workspace boundary.");
    }
    return { allowed: true };
  } catch {
    return blocked("The source path could not be verified for OpenAI analysis.");
  }
}

function isWithin(candidate: string, root: string): boolean {
  const relative = path.relative(root, candidate);
  return relative !== ".." && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative);
}

function blocked(reason: string): CloudSourceBoundaryDecision {
  return { allowed: false, reason };
}
