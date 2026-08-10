export const ONTOLOGY_VERSION = "1";

export const RESPONSIBILITIES = [
  "business_logic",
  "validation",
  "utility",
  "data",
  "infrastructure",
  "external_io",
  "transformation",
  "mixed",
  "unknown"
] as const;

export type Responsibility = (typeof RESPONSIBILITIES)[number];

export interface ResponsibilityMetadata {
  label: string;
  description: string;
  color: string;
}

export const RESPONSIBILITY_METADATA: Readonly<
  Record<Responsibility, ResponsibilityMetadata>
> = {
  business_logic: {
    label: "Business Logic",
    description: "Domain rules, decisions, calculations, and workflows.",
    color: "#2E7D32"
  },
  validation: {
    label: "Validation",
    description: "Input, state, schema, permission, and precondition checks.",
    color: "#F9A825"
  },
  utility: {
    label: "Utility",
    description: "Generic reusable functionality that is not domain-specific.",
    color: "#1565C0"
  },
  data: {
    label: "Data",
    description: "Types, schemas, models, constants, and data representation.",
    color: "#00838F"
  },
  infrastructure: {
    label: "Infrastructure",
    description: "Configuration, framework setup, dependency wiring, and adapters.",
    color: "#6A1B9A"
  },
  external_io: {
    label: "External I/O",
    description: "Communication with databases, files, queues, APIs, or services.",
    color: "#EF6C00"
  },
  transformation: {
    label: "Transformation",
    description: "Mapping, normalization, parsing, and representation conversion.",
    color: "#AD1457"
  },
  mixed: {
    label: "Mixed Responsibility",
    description: "Multiple significant responsibilities share this broad region.",
    color: "#616161"
  },
  unknown: {
    label: "Unknown",
    description: "There is not enough evidence for a responsible classification.",
    color: "#9E9E9E"
  }
};

export function isResponsibility(value: unknown): value is Responsibility {
  return (
    typeof value === "string" &&
    (RESPONSIBILITIES as readonly string[]).includes(value)
  );
}

export type ConfidenceLabel = "High" | "Medium" | "Low";

export function confidenceLabel(confidence: number): ConfidenceLabel {
  if (confidence >= 0.8) {
    return "High";
  }
  if (confidence >= 0.55) {
    return "Medium";
  }
  return "Low";
}

