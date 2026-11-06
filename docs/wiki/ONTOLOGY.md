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


## Choosing among plausible categories

Classify the operation's dominant purpose in context, not its syntax or folder. A price calculation using `reduce` is business logic; projecting identifiers using `map` is transformation. A database read remains external I/O when assigned to a variable. A type/schema declaration is data, but applying a schema to reject input is validation. Technical registration is infrastructure even when its inline callback transforms values.

An indivisible statement receives one best-fitting specific category, or unknown when evidence is insufficient. Mixed is reserved for a broad region with multiple substantial responsibilities and no coherent dominant purpose; incidental supporting steps need not make a function mixed. These are prompt clarifications within ontology v1, not new categories.
