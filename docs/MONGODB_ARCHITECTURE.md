# SmartSearch MongoDB Architecture

This document describes the MongoDB implementation in `packages/backend/src`.
It reflects the current repository and is not a claim about a benchmarked
production workload.

## Database and collections

The backend resolves its database from `MONGODB_DB`, falling back to the
database path in `MONGODB_URI`. The project’s local setup and seed scripts use
the database name `smartsearch`.

| Collection | Purpose | Creation/index lifecycle |
| --- | --- | --- |
| `documents` | Searchable content records used by baseline search, Atlas Search, suggestions, and facets. | Created implicitly by MongoDB writes as needed. Its standard indexes are declared in `src/db/documents.ts` and explicitly created by `npm run db:indexes --workspace packages/backend`. Atlas Search indexes are separate and must be provisioned in Atlas. |
| `search_events` | Search request events used to produce aggregate analytics. | Created on insert as needed. The `occurredAt_ttl_30d` TTL index is declared and verified by `npm run db:analytics-indexes --workspace packages/backend`. |

The API does not create indexes during application startup. Database/index
maintenance scripts use the shared `withDatabase` helper and restrict their
target to the `smartsearch` database. Atlas Search indexes are not ordinary
MongoDB collection indexes and are managed separately.

## `documents` records

The TypeScript model is `DocumentRecord` in `src/models/document.ts`:

| Field | Stored representation and contract |
| --- | --- |
| `_id` | Non-empty string. Seed data uses deterministic values such as `doc-0001`. |
| `title` | String whose trimmed length is 3–200 characters. |
| `description` | String whose trimmed length is 10–500 characters. |
| `content` | String whose trimmed length is 20–20,000 characters. Indexed for full-text search but deliberately omitted from public search result documents. |
| `category` | One of `engineering`, `data`, `devops`, `security`, `design`, or `product`. |
| `tags` | Array of 1–10 strings, each with a trimmed length of 1–40 characters, with no exact duplicates in the document validator. Search query tags are lowercased before allowing only letters, digits, and hyphens. |
| `author` | String whose trimmed length is 2–100 characters. |
| `createdAt`, `updatedAt` | Valid BSON dates; validation requires `updatedAt >= createdAt`. JSON responses serialize dates as ISO date-time strings. |

`validateDocument` is runtime application validation used by the seed flow; the
repository does not declare a MongoDB server-side JSON Schema validator. The
seed generator creates 200 deterministic sample documents, and repository
seeding uses bulk upserts keyed by `_id` rather than deleting records.

### Standard collection indexes

`DOCUMENT_INDEXES` in `src/db/documents.ts` declares these indexes:

| Index name | Key pattern | Query role |
| --- | --- | --- |
| `category_createdAt` | `{ category: 1, createdAt: -1 }` | Category equality with newest-first ordering. |
| `tags_createdAt` | `{ tags: 1, createdAt: -1 }` | Tag multikey filtering with newest-first ordering. |
| `createdAt_desc` | `{ createdAt: -1 }` | Newest-first browsing. |
| `category_tags` | `{ category: 1, tags: 1 }` | Combined category/tag filtering. |
| `title_text` | `{ title: "text", description: "text", content: "text" }` | Baseline MongoDB `$text` search. |
| `updatedAt_desc` | `{ updatedAt: -1 }` | Updated-date ordering. |
| `createdAt_desc_id` | `{ createdAt: -1, _id: -1 }` | Created sort with a deterministic `_id` tie-breaker. |
| `updatedAt_desc_id` | `{ updatedAt: -1, _id: -1 }` | Updated sort with a deterministic `_id` tie-breaker. |
| `category_createdAt_id` | `{ category: 1, createdAt: -1, _id: -1 }` | Category equality and the complete created sort key. |
| `tags_createdAt_id` | `{ tags: 1, createdAt: -1, _id: -1 }` | Tag filtering and the complete created sort key. |

The created/updated sort construction in `src/search/repository.ts` mirrors the
compound `createdAt`/`updatedAt` index patterns and adds `_id` for deterministic
ties. Relevance sorting also includes text score and date tie-breakers; no
claim is made that every text-search sort is covered by a collection index.
This alignment does not constitute a measured latency claim. Some simpler
index declarations coexist with later tie-breaker variants and are kept as
declared in the current code.

## Baseline MongoDB `$text` search

`GET /api/search` uses the ordinary `title_text` text index. The query layer
normalizes and validates query parameters before repository execution:

- A non-empty `q` becomes MongoDB `$text: { $search: q }`.
- `category` adds an exact equality filter.
- Requested query tags are combined with `$all`, so all requested tags must
  occur on the record.
- With a non-empty query, default sorting uses `$meta: "textScore"` followed by
  descending `createdAt` and `_id`. Explicit `created` and `updated` sorts use
  their descending date fields and `_id`.
- An empty query defaults to `created` ordering; relevance sorting requires
  non-empty query text.
- Pagination is one-based, capped at page 1000 and 100 results per page. The
  page fetch and `countDocuments` run concurrently.

The result projection includes summary metadata and excludes `content`; the
service removes it again when shaping the public result. A score is returned
when the repository has a MongoDB text score. This is the standard MongoDB text
search path; it does not require either Atlas Search index.

## Atlas Search indexes

The declarative index definitions are in `src/search/atlas-index.ts`. Both use
`dynamic: false`, so only explicitly listed fields are indexed.

### `documents_search`

This index supports `GET /api/search/advanced` and optional facets:

- `title`, `description`, and `content` are `string` fields analyzed with
  `lucene.english`. The English analyzer applies language-aware tokenization
  and stemming; e.g. related inflections may match. Results depend on Atlas
  analyzer semantics rather than the baseline `$text` implementation.
- `category` and `tags` each have two mappings: a `string` with
  `lucene.keyword`, and a `token` with lowercase normalization. The string
  mapping is used by the Atlas text filters; the token mapping supports the
  facet collector.
- `createdAt` is mapped as `date`.

The source also retains `DOCUMENTS_SEARCH_INDEX_STANDARD_ROLLBACK`, a previous
mapping with `lucene.standard` full-text fields and no token facet mappings.
It is a rollback definition, not an additional live index.

### `documents_autocomplete`

This separate index serves `GET /api/search/suggest`:

- Only `title` is indexed, using Atlas Search `autocomplete`.
- It uses `lucene.standard`, `edgeGram` tokenization, and grams from 2 through
  20 characters.

Autocomplete has its own mapping because prefix matching needs a different
index field type/tokenization than the full-text search index.

## Advanced search, filtering, facets, and pagination

`src/search/advanced-repository.ts` builds a `$search` compound query:

- `compound.must` uses the Atlas `text` operator across `title`, `description`,
  and `content`. Empty text uses `match_all`.
- If enabled (default), fuzzy options are sent with `maxEdits` defaulting to 1
  and constrained to 1–2; `prefixLength` defaults to 0 and is constrained to
  0–3.
- `compound.filter` adds exact category and tag clauses without contributing
  to the relevance score. One clause is emitted per tag, making requested tags
  an AND condition.
- Atlas score is added as `_score`; the repository applies `$skip`, `$limit`,
  and a projection. `content` is excluded from returned public documents.
- A parallel `$searchMeta` request obtains the total count; pagination metadata
  is computed by the service. There is no separate client-selected sort
  parameter for this endpoint; the Atlas result order is relevance order.

When `facets=true`, `src/search/facet-repository.ts` issues a `$searchMeta`
facet collector using the text query and category/tag filters. It returns
category and tag buckets (up to 20 each by default), sorted by count. The facet
stage currently does not include the advanced search's fuzzy settings, so its
buckets are based on the non-fuzzy text clause. Facets are omitted unless
requested; the index’s token mappings are required by the Atlas facet
collector.

The index status probe checks `listSearchIndexes` and caches status for 30
seconds per index. A missing, building, or non-queryable index produces a
service-unavailable response rather than being represented as a successful
empty result set.

## Search analytics

`search_events` records successful baseline and advanced-search requests;
autocomplete requests are not recorded. Search event recording is scheduled
after the successful search response and persistence failures are logged
without changing that response.

An event contains `occurredAt`, engine (`baseline` or `atlas`), normalized query,
result count, measured duration, optional category, tags, and filter/facet
flags. Query normalization applies NFKC, whitespace/control-character
normalization, lowercasing, a 120-character bound, and simple email/phone
pattern replacement. This is a limited sanitizer, not guaranteed
anonymization. The `occurredAt_ttl_30d` index expires old event documents after
30 days (MongoDB TTL deletion is asynchronous).

`GET /api/analytics/overview` is public (the API has no authentication) and
matches a trailing half-open date range
`[from, to)` and runs a `$facet` aggregation to compute:

- Total requests, zero-result requests, and requests using category/tag filters.
- Request counts and average recorded duration by engine.
- Daily request volume grouped by UTC date.
- Category and individual tag usage counts.
- Up to 10 most frequent non-empty normalized queries.

Before returning the response, the analytics service replaces every readable
top-query string with the literal `[private query]`, retaining only its request
count. It also reports percentile latency as deferred; percentiles are not
currently computed. The raw stored normalized queries remain in the collection
until TTL expiry, so access to MongoDB data should still be treated as access to
potentially user-provided text.

## Design trade-offs and limits

- Baseline `$text` and Atlas Search are separate query engines with different
  analyzers and score behavior; scores should not be compared as a common scale.
- Atlas Search features depend on Atlas index provisioning and queryability;
  the ordinary MongoDB text index remains a separate baseline path.
- Offset pagination uses `$skip` and has a deliberate depth cap; it is not
  cursor-based pagination.
- Search results omit full document content to keep the result contract
  summary-oriented.
- Search-event text is sanitized, retention-bounded, and redacted in the
  analytics response, but normalization is not a full sensitive-data detector.
- No measured performance benchmarks are included in this repository’s
  implementation or tests.

## Related source

- Document contract and validation: `packages/backend/src/models/document.ts`
- Standard indexes and repository: `packages/backend/src/db/documents.ts`
- Atlas mappings: `packages/backend/src/search/atlas-index.ts`
- Baseline query/repository: `packages/backend/src/search/query.ts` and
  `packages/backend/src/search/repository.ts`
- Advanced query/repository/facets: `packages/backend/src/search/advanced-query.ts`,
  `packages/backend/src/search/advanced-repository.ts`, and
  `packages/backend/src/search/facet-repository.ts`
- Analytics event and aggregation: `packages/backend/src/search/analytics.ts`
  and `packages/backend/src/search/analytics-repository.ts`
