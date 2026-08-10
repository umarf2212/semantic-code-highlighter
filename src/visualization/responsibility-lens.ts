import type { Responsibility } from "../domain/responsibility";
import type { ResponsibilitySpan } from "./line-map";

export function filterSpansForLens(
  spans: ResponsibilitySpan[],
  focusedResponsibility?: Responsibility
): ResponsibilitySpan[] {
  if (focusedResponsibility === undefined) {
    return spans;
  }
  return spans.filter(
    ({ responsibility }) => responsibility === focusedResponsibility
  );
}

