// Semantic decisions authored after reading these pinned files and their relevant callees.
// Index ranges refer to the ordered region metadata collected alongside this script.
// This is a reproducible demonstration map, not independent accuracy ground truth.
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';

const plans = {
  'hackathon-starter': [
    ['0-1', 'infrastructure', 'Loads the validator and mail adapter dependencies.'],
    ['2', 'external_io', 'Calls the remote reCAPTCHA assessment service and returns its result.'],
    ['3-6', 'infrastructure', 'Builds the service endpoint from environment configuration.'],
    ['7', 'transformation', 'Projects the supplied token and site key into the assessment payload.'],
    ['8', 'external_io', 'Sends the assessment request to the remote reCAPTCHA API.'],
    ['9-10', 'transformation', 'Decodes and projects the remote assessment into a smaller result.'],
    ['11-12', 'infrastructure', 'Implements the Express contact page handler.'],
    ['13', 'transformation', 'Derives the anonymous-user flag used by the contact template.'],
    ['14-15', 'infrastructure', 'Warns about missing CAPTCHA deployment configuration.'],
    ['16', 'external_io', 'Renders and sends the contact page through the HTTP response.'],
    ['17-18', 'business_logic', 'Coordinates contact submission, admissibility checks and email delivery.'],
    ['19', 'validation', 'Collects contact-submission input and CAPTCHA errors.'],
    ['20-21', 'data', 'Declares the sender fields populated later in the workflow.'],
    ['22-29', 'validation', 'Checks the required sender, message and CAPTCHA inputs.'],
    ['30', 'infrastructure', 'Logs missing CAPTCHA configuration rather than validating a token.'],
    ['31-33', 'validation', 'Coordinates the CAPTCHA admissibility check and error handling.'],
    ['34', 'external_io', 'Invokes the same-file helper that calls the remote assessment API.'],
    ['35-37', 'validation', 'Rejects a failed CAPTCHA assessment or turns its failure into a rejected submission.'],
    ['38', 'infrastructure', 'Records the failed assessment in the application log.'],
    ['39-42', 'validation', 'Collects errors and prevents delivery when submission requirements fail.'],
    ['43-44', 'external_io', 'Writes flash feedback or sends the redirect response.'],
    ['45-50', 'transformation', 'Selects and projects sender identity from form input or the signed-in user.'],
    ['51', 'external_io', 'Sends contact email through the configured Nodemailer adapter.'],
    ['52', 'transformation', 'Builds the mail payload from the selected sender and message.'],
    ['53', 'infrastructure', 'Configures delivery feedback and error messages for the mail adapter.'],
    ['54', 'external_io', 'The imported sendMail adapter creates a transport and sends the message.'],
    ['55', 'business_logic', 'Coordinates mail delivery and the successful redirect.'],
    ['56-57', 'external_io', 'Sends the email or the resulting HTTP redirect.'],
    ['58-59', 'infrastructure', 'Passes delivery errors to Express error middleware.']
  ],
  realworld: [
    ['0', 'infrastructure', 'Imports the persistence adapter, mappers and HTTP error type.'],
    ['1-16', 'transformation', 'Builds a Prisma filter representation from author, tag and favorite query parameters.'],
    ['17', 'business_logic', 'Coordinates article listing, persistence reads and response mapping.'],
    ['18', 'transformation', 'The same-file helper converts query parameters to Prisma filters.'],
    ['19-20', 'external_io', 'Counts or reads matching articles through Prisma.'],
    ['21-22', 'transformation', 'Projects stored articles into the API response through articleMapper.'],
    ['23', 'business_logic', 'Coordinates the followed-author feed query and API response.'],
    ['24-25', 'external_io', 'Counts or reads the followed-author articles from persistence.'],
    ['26-27', 'transformation', 'Maps persistent articles into the feed response.'],
    ['28', 'business_logic', 'Creates an article after required-field and uniqueness checks.'],
    ['29-30', 'transformation', 'Extracts article input and normalizes the optional tag list.'],
    ['31-36', 'validation', 'Rejects a missing title, description or body with HTTP 422.'],
    ['37', 'transformation', 'Converts the title and author identifier into an article slug.'],
    ['38', 'external_io', 'Looks up an existing slug through the Prisma database adapter.'],
    ['39-40', 'validation', 'Enforces uniqueness before writing the new article.'],
    ['41', 'external_io', 'Creates the article and linked tags and author in persistence.'],
    ['42-43', 'transformation', 'Projects tags into connect-or-create shapes or maps the created article for the API.'],
    ['44', 'business_logic', 'Retrieves one article and rejects a missing result.'],
    ['45', 'external_io', 'Loads the requested article and related records through Prisma.'],
    ['46-47', 'validation', 'Rejects a missing article with HTTP 404.'],
    ['48', 'transformation', 'The imported mapper projects stored fields into the article response.'],
    ['49-50', 'external_io', 'Updates persistence to disconnect the article tag relations.'],
    ['51', 'business_logic', 'Coordinates authorized article updates, title uniqueness and tag replacement.'],
    ['52', 'data', 'Declares the optional replacement slug.'],
    ['53', 'external_io', 'Reads the existing article and author identifier for the update.'],
    ['54-57', 'validation', 'Requires an existing article owned by the acting user.'],
    ['58', 'business_logic', 'Coordinates optional title replacement and its uniqueness check.'],
    ['59', 'transformation', 'Converts the replacement title into a slug.'],
    ['60', 'validation', 'Checks replacement-slug uniqueness when the slug changes.'],
    ['61', 'external_io', 'Queries persistence for a conflicting replacement slug.'],
    ['62-63', 'validation', 'Rejects a conflicting article title.'],
    ['64-65', 'transformation', 'Normalizes supplied tags into persistence relation operations.'],
    ['66-67', 'external_io', 'Disconnects old tag relations and persists the updated article.'],
    ['68', 'transformation', 'Maps the updated article to its API representation.'],
    ['69', 'business_logic', 'Coordinates article deletion after existence and ownership checks.'],
    ['70', 'external_io', 'Loads the article and owner from persistence.'],
    ['71-74', 'validation', 'Requires an existing article owned by the deleting user.'],
    ['75', 'external_io', 'Deletes the article from persistence.'],
    ['76', 'business_logic', 'Coordinates comment retrieval and the caller-specific response.'],
    ['77-80', 'transformation', 'Builds the comment author filter from demo and signed-in identities.'],
    ['81', 'external_io', 'Queries the article and its visible comments from persistence.'],
    ['82-85', 'transformation', 'Projects comments and following status into the API response.'],
    ['86', 'business_logic', 'Coordinates comment creation and its returned representation.'],
    ['87-88', 'validation', 'Rejects an empty comment body.'],
    ['89-90', 'external_io', 'Loads the parent article and creates a related comment in persistence.'],
    ['91-92', 'transformation', 'Projects the new comment and author following flag for the API.'],
    ['93', 'business_logic', 'Coordinates authorized comment deletion.'],
    ['94', 'external_io', 'Loads the comment and author from persistence.'],
    ['95-98', 'validation', 'Requires an existing comment owned by the acting user.'],
    ['99', 'external_io', 'Deletes the comment through Prisma.'],
    ['100', 'business_logic', 'Coordinates the favorite relation change and response.'],
    ['101', 'external_io', 'Persists the user favorite relation and loads the article relations.'],
    ['102-105', 'transformation', 'Projects tags, author and favorite state into the API response.'],
    ['106', 'business_logic', 'Coordinates removal of the favorite relation and response.'],
    ['107', 'external_io', 'Persists removal of the user favorite relation.'],
    ['108-111', 'transformation', 'Projects the updated article and favorite state for the API.']
  ],
  express: [
    ['0-8', 'infrastructure', 'Enables strict mode or loads HTTP representation and parsing dependencies.'],
    ['9-10', 'transformation', 'Normalizes supported HTTP method names to lowercase.'],
    ['11-12', 'infrastructure', 'Configures strong and weak entity-tag generator functions.'],
    ['13-40', 'transformation', 'Normalizes MIME types or parses Accept parameters into structured values.'],
    ['41-55', 'infrastructure', 'Resolves the ETag setting to an application generator function.'],
    ['56-57', 'validation', 'Rejects an unsupported ETag configuration value.'],
    ['58-73', 'infrastructure', 'Returns the configured generator or resolves the query parser setting.'],
    ['74-75', 'validation', 'Rejects an unsupported query parser configuration value.'],
    ['76-81', 'infrastructure', 'Resolves the parser or configures the proxy trust predicate.'],
    ['82-84', 'validation', 'Produces the configured predicate that admits every proxy hop.'],
    ['85', 'infrastructure', 'Selects hop-count based proxy trust configuration.'],
    ['86-88', 'validation', 'Produces the predicate that admits proxy hops below the configured count.'],
    ['89', 'infrastructure', 'Selects the string form of proxy trust configuration.'],
    ['90-92', 'transformation', 'Splits and trims comma-separated proxy addresses.'],
    ['93', 'infrastructure', 'Compiles the configured proxy address trust predicate.'],
    ['94-100', 'transformation', 'Parses a Content-Type, updates charset and serializes the new header value.'],
    ['101-102', 'infrastructure', 'Creates an entity-tag generator with the supplied options.'],
    ['103-105', 'transformation', 'Converts the body to a buffer and generates its entity-tag representation.'],
    ['106-107', 'transformation', 'Parses an extended query string into structured values.']
  ],
  nodebb: [
    ['0-11', 'infrastructure', 'Loads dependencies and wires post methods onto the exported Posts module.'],
    ['12-13', 'business_logic', 'Coordinates post creation, federation metadata and persistence side effects.'],
    ['14-17', 'transformation', 'Extracts and normalizes incoming post fields and defaults.'],
    ['18', 'data', 'Initializes the attachment-presence flag.'],
    ['19-22', 'validation', 'Rejects invalid author and reply-target identifiers.'],
    ['23', 'external_io', 'Allocates the next post identifier by updating the database counter.'],
    ['24-26', 'transformation', 'Builds the stored post representation and optional reply field.'],
    ['27-28', 'business_logic', 'Applies the forum policy controlling whether an IP is stored with a post.'],
    ['29-40', 'transformation', 'Projects optional and federated post metadata and rewrites emoji representation.'],
    ['41', 'unknown', 'Plugin implementations may alter the post or perform side effects; this dispatch alone cannot establish their purpose.'],
    ['42', 'external_io', 'Collects upload paths using thumbnail reads and filesystem-backed path validation.'],
    ['43', 'transformation', 'Serializes upload metadata for the stored post.'],
    ['44-45', 'external_io', 'Writes the post and reads the topic category and pin state from persistence.'],
    ['46', 'transformation', 'Adds the loaded category identifier to the post representation.'],
    ['47', 'business_logic', 'Distinguishes remote from local post identifiers for bookkeeping.'],
    ['48', 'external_io', 'Persists post indexes, counts, reply links and upload metadata.'],
    ['49', 'unknown', 'The plugin filter body is not fixed here; its purpose depends on installed plugins.'],
    ['50', 'transformation', 'Adds the main-post flag to the returned post representation.'],
    ['51', 'infrastructure', 'Dispatches the post-save lifecycle hook to installed plugins.'],
    ['52-53', 'business_logic', 'Returns the created post or coordinates reply relationship bookkeeping.'],
    ['54-55', 'validation', 'Requires a reply target before updating its reply relationship.'],
    ['56', 'external_io', 'Posts.exists reads database existence for the reply target.'],
    ['57-58', 'validation', 'Requires the reply target to exist before linking it.'],
    ['59', 'external_io', 'Persists the reply index and increments its reply counter.']
  ]
};

for (const [name, groups] of Object.entries(plans)) {
  const root = path.resolve('.qa/uat/repos', name);
  const input = JSON.parse(await readFile(path.join(root, '.semantic-code/requests.json'), 'utf8'));
  const view = JSON.parse(await readFile(`docs/uat/2026-11-05/evidence/${name}-regions.json`, 'utf8'));
  const file = input.files[0];
  const decisions = new Map();
  for (const [range, responsibility, explanation] of groups) {
    const [start, end = start] = range.split('-').map(Number);
    for (let index = start; index <= end; index++) {
      if (decisions.has(index)) throw new Error(`Duplicate ${name}:${index}`);
      decisions.set(index, { regionId: view[index].id, responsibility,
        confidence: responsibility === 'unknown' ? 0.3 : 0.9, explanation });
    }
  }
  if (decisions.size !== view.length) throw new Error(`Incomplete ${name}: ${decisions.size}/${view.length}`);
  const byId = new Map([...decisions.values()].map(decision => [decision.regionId, decision]));
  const lineOwners = file.lineOwnershipChoices.map(choice => {
    // Every competing region has the same purpose on these nine lines. Assert that explicitly.
    const purposes = new Set(choice.candidateRegionIds.map(id => byId.get(id).responsibility));
    if (purposes.size !== 1) throw new Error(`Review ownership ${name}:${choice.line}`);
    return { line: choice.line, regionId: choice.candidateRegionIds[0] };
  });
  const { files: _files, ...header } = input;
  const map = { ...header, files: [{ filePath: file.filePath, sourceHash: file.sourceHash,
    classification: { regions: [...decisions.values()], lineOwners } }] };
  const text = JSON.stringify(map, null, 2) + '\n';
  await writeFile(path.join(root, '.semantic-code/map.json'), text);
  await mkdir('docs/uat/2026-11-05/maps', { recursive: true });
  await writeFile(`docs/uat/2026-11-05/maps/${name}.json`, text);
  console.log(`${name}: ${decisions.size} authored regions; ${lineOwners.length} inline ownership decisions`);
}
