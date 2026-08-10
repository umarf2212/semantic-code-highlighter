# Responsibility Ontology

Ontology version: `1`

The visual vocabulary is deliberately small:

| Responsibility | Meaning |
| --- | --- |
| `business_logic` | Domain rules, decisions, calculations, workflows, and state transitions |
| `validation` | Input, state, schema, permission, or precondition checks |
| `utility` | Generic reusable helpers that are not domain-specific |
| `data` | Types, interfaces, schemas, models, constants, and data representation |
| `infrastructure` | Configuration, dependency wiring, framework setup, and technical adapters |
| `external_io` | Databases, HTTP, files, queues, and third-party service communication |
| `transformation` | Mapping, normalization, parsing, serialization, and representation conversion |
| `mixed` | A parent genuinely contains multiple significant responsibilities |
| `unknown` | Evidence is insufficient for a responsible classification |

`mixed` and `unknown` are classifier states. They are not equally prominent visual categories: specific children remain colored inside a mixed parent, and unknown regions are normally left uncolored.

Do not add a category to solve one repository's naming convention. A future project-specific ontology must be explicit and versioned.

