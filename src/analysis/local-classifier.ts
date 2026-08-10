import type {
  ClassificationRequest,
  ClassificationResult,
  ClassifiedRegion,
  CodeClassifier
} from "../domain/classification";
import type { CodeRegion } from "../domain/code-region";
import type { Responsibility } from "../domain/responsibility";

interface HeuristicClassification {
  responsibility: Responsibility;
  confidence: number;
  explanation: string;
}

export class LocalHeuristicClassifier implements CodeClassifier {
  readonly id = "local";
  readonly version = "3";

  async classify(request: ClassificationRequest): Promise<ClassificationResult> {
    request.signal?.throwIfAborted();
    const preliminary = new Map<string, HeuristicClassification>();
    for (const region of request.regions) {
      preliminary.set(region.id, classifyRegion(region, request.filePath));
    }

    const final = new Map(preliminary);
    const deepestFirst = [...request.regions].sort(
      (left, right) => right.depth - left.depth
    );
    for (const region of deepestFirst) {
      const children = region.childIds
        .map((childId) => final.get(childId))
        .filter((value): value is HeuristicClassification => value !== undefined);
      if (children.length === 0) {
        continue;
      }

      const aggregate = aggregateChildren(children);
      const own = preliminary.get(region.id);
      if (own === undefined) {
        final.set(region.id, aggregate);
      } else if (aggregate.responsibility === "mixed" || own.confidence < 0.78) {
        final.set(region.id, aggregate);
      }
    }

    const regions: ClassifiedRegion[] = request.regions.map((region) => {
      const classification = final.get(region.id) ?? unknownClassification();
      return {
        regionId: region.id,
        responsibility: classification.responsibility,
        confidence: classification.confidence,
        explanation: classification.explanation
      };
    });

    request.signal?.throwIfAborted();

    return {
      filePath: request.filePath,
      regions,
      classifierVersion: `${this.id}:${this.version}`
    };
  }
}

function classifyRegion(region: CodeRegion, filePath: string): HeuristicClassification {
  const source = region.source.toLowerCase();
  const name = (region.name ?? "").toLowerCase();
  const path = filePath.toLowerCase();
  const evidence = `${path}\n${name}\n${source}`;

  if (["interface", "type", "enum"].includes(region.type)) {
    return classification("data", 0.98, "Declares a data shape or value set.");
  }
  if (
    (region.type === "class" &&
      /(^|[/._-])(models?|schemas?|types?)([/._-]|$)/.test(path)) ||
    (region.type === "statement" &&
      (/^const\s+[A-Z][A-Z\d_]*\s*=/.test(region.source.trim()) ||
        /\bas const\b/.test(source)))
  ) {
    return classification("data", 0.76, "Defines a stable data value or representation.");
  }
  if (region.type === "imports") {
    return classification(
      "infrastructure",
      0.72,
      "Connects this file to external modules and dependencies."
    );
  }
  if (
    /\b(assert|validate|validation|invalid|isvalid|required|guard|unauthori[sz]ed|forbidden|precondition)\b/.test(
      evidence
    ) ||
    /throw\s+new\s+\w*error/.test(source) ||
    /\b(zod|joi|yup)\b.*\b(parse|validate)\b/.test(source)
  ) {
    return classification(
      "validation",
      0.86,
      "Checks a requirement or rejects invalid state."
    );
  }
  if (
    /\b(fetch|axios|got|request)\s*[.(]/.test(source) ||
    /\b(prisma|repository|database|db|redis|queue|s3|firestore)\b/.test(source) ||
    /\b(readfile|writefile|appendfile|send|publish|enqueue|dequeue)\s*\(/.test(source) ||
    /\.(find|findone|findmany|query|execute|save|insert|update|delete)\s*\(/.test(source)
  ) {
    return classification(
      "external_io",
      0.88,
      "Communicates with a database, file, queue, API, or service."
    );
  }
  if (
    /\b(map|normalize|seriali[sz]e|deseriali[sz]e|transform|convert|todto|fromdto|hydrate)\w*\b/.test(
      evidence
    ) ||
    /\.(map|flatmap|reduce)\s*\(/.test(source) ||
    /json\.(parse|stringify)\s*\(/.test(source) ||
    /\.(exec|positionat)\s*\(/.test(source)
  ) {
    return classification(
      "transformation",
      0.82,
      "Converts data from one representation to another."
    );
  }
  if (
    /(^|[/._-])(config|infra|adapter|middleware|bootstrap|server|router|provider)([/._-]|$)/.test(
      path
    ) ||
    /\b(config|configure|setup|initialize|bootstrap|middleware|router|container|provider|adapter|connection)\b/.test(
      evidence
    ) ||
    /\b(process\.env|createclient|createserver)\b/.test(source) ||
    /\bvscode\.(window|workspace|commands|languages|debug|extensions|env)\b/.test(source) ||
    /\bcontext\.subscriptions\b/.test(source) ||
    /\.(ondidchange\w*|setdecorations|createtexteditordecorationtype|register\w*provider|registercommand)\s*\(/.test(
      source
    ) ||
    /\bconsole\.(log|warn|error|debug|info)\s*\(/.test(source)
  ) {
    return classification(
      "infrastructure",
      0.78,
      "Sets up or connects technical application machinery."
    );
  }
  if (
    /(^|[/._-])(util|utils|helpers?)([/._-]|$)/.test(path) ||
    /\b(util|helper|format|slug|clamp|memoize|debounce|throttle)\b/.test(name) ||
    /\b(settimeout|cleartimeout|setinterval|clearinterval|queuemicrotask)\s*\(/.test(source)
  ) {
    return classification(
      "utility",
      0.8,
      "Provides generic reusable functionality."
    );
  }
  if (
    /(^|[/._-])(domain|services?|use-?cases?|workflows?)([/._-]|$)/.test(path) ||
    /\b(calculate|pricing|price|total|discount|eligib\w*|order|invoice|payment|checkout|cart|balance|quota|policy|approve|reject)\w*\b/.test(
      evidence
    )
  ) {
    return classification(
      "business_logic",
      0.74,
      "Implements an evidenced domain decision, calculation, or workflow step."
    );
  }
  return unknownClassification();
}

function aggregateChildren(
  children: HeuristicClassification[]
): HeuristicClassification {
  const useful = children.filter(
    ({ responsibility }) => responsibility !== "unknown" && responsibility !== "mixed"
  );
  if (useful.length === 0) {
    return unknownClassification();
  }

  const counts = new Map<Responsibility, number>();
  for (const child of useful) {
    counts.set(child.responsibility, (counts.get(child.responsibility) ?? 0) + 1);
  }
  const ranked = [...counts.entries()].sort((left, right) => right[1] - left[1]);
  const top = ranked[0];
  if (top === undefined) {
    return unknownClassification();
  }
  const [responsibility, count] = top;
  const share = count / useful.length;
  if (ranked.length > 1 && share < 0.8) {
    return classification(
      "mixed",
      0.7,
      "Contains multiple significant child responsibilities."
    );
  }
  return classification(
    responsibility,
    Math.min(0.82, averageConfidence(useful)),
    `Primarily ${responsibility.replaceAll("_", " ")} based on its child regions.`
  );
}

function averageConfidence(values: HeuristicClassification[]): number {
  return values.reduce((sum, value) => sum + value.confidence, 0) / values.length;
}

function classification(
  responsibility: Responsibility,
  confidence: number,
  explanation: string
): HeuristicClassification {
  return { responsibility, confidence, explanation };
}

function unknownClassification(): HeuristicClassification {
  return classification(
    "unknown",
    0.35,
    "The local classifier does not have enough evidence."
  );
}
