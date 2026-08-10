export function nonIdentifyingFileLabel(uriPath: string): string {
  return (
    uriPath
      .replaceAll("\\", "/")
      .split("/")
      .filter((segment) => segment.length > 0)
      .at(-1) ?? "source-file"
  );
}

