# Atlas Search in SmartSearch

SmartSearch uses two search paths:

- Baseline MongoDB `$text` search via `GET /api/search`
- Atlas Search via `GET /api/search/advanced` and `GET /api/search/suggest`

This document explains how the project uses Atlas Search, how the two query styles differ, and how to validate that the search indexes are ready.

## Baseline MongoDB `$text` search

The baseline engine is the standard MongoDB text search path. It runs against the `documents` collection using a text index and MongoDB text score relevance.

The app uses the `title_text`-style index pattern for the collection and handles validation server-side before the query runs. This path is the fallback when Atlas Search is unavailable.

Key behaviour:

- Works without Atlas Search configuration
- Uses MongoDB text semantics
- Supports category and tag filters
- Supports relevance, created, and updated sorting
- Applies pagination and page size constraints server-side

## Atlas Search configuration

Atlas Search is configured with dedicated indexes for full-text search and autocomplete.

The project expects these indexes:

- `documents_search` for full-text matching, filtering, and facets
- `documents_autocomplete` for type-ahead suggestions

The actual index definitions live in the backend search configuration and are prepared for Atlas UI or API creation. The critical detail is that `category` and `tags` are indexed as both string and token fields so that:

- string fields can participate in text matching and filter logic
- token fields can be used for facet buckets and event counts

## Compound query design

The advanced Atlas Search endpoint uses a compound query pattern for a better user experience:

- text score / phrase match on title, description, or content
- optional category and tag filters
- fuzzy matching when enabled
- pagination and engine-specific sorting rules

The purpose is to combine broad relevance scoring with structured filters so that users can search by concept while narrowing results by metadata.

## Fuzzy matching

When the user enables fuzzy matching on the Atlas route, the backend sends Atlas Search fuzzy options to the MongoDB aggregation pipeline. This is a helpful typo-tolerance layer for user input such as `pipelnes` or `agreggation`.

Important:

- fuzzy matching is not a substitute for stemming
- it is best for typo tolerance, not lexical expansion
- the Atlas route still respects category and tag filters

## Autocomplete

Autocomplete uses the separate `documents_autocomplete` index and requests prefix suggestions from the title field. The index is configured to allow edge-gram tokenization so common prefixes are fast to match.

The user experience is:

- query input starts typing
- the frontend requests suggestions from the backend
- the backend calls the Atlas autocomplete index
- the response returns a short, deduplicated set of titles

## Category and tag filters

Filters are applied before or during Atlas query execution, depending on the stage. The relevant backend logic keeps them aligned with the Atlas field mapping.

- category uses the indexed category field
- tags are mapped as lowercase values and checked in the appropriate filtered field
- the app supports AND-style tag combinations and category narrowing

This is the same filter concept used by the baseline engine, but the Atlas pathway uses the Atlas Search query configuration rather than MongoDB text index matching.

## Facets

Facet responses are returned only when the request asks for them (for example, `?facets=true`).

The Atlas index includes token fields for `category` and `tags`, which allows the app to summarize counts per bucket without exposing raw document payloads. The frontend uses those counts to populate the filter sidebar and facet summary.

## Pagination and sorting

The two engines differ deliberately:

- Baseline search supports `relevance`, `created`, and `updated` sorting
- Atlas Search supports `relevance` only in the query path that the frontend sends
- unsupported sort parameters are not forwarded to Atlas
- page numbers and page sizes are still validated on the server before results are returned

This keeps the app consistent with the backend contract while preventing invalid Atlas queries.

## Verifying the Atlas Search indexes are ready

The project includes a search status helper. Run:

```bash
npm run db:search-status
```

The script reports whether the required indexes are present and queryable. A healthy Atlas Search environment should show both indexes as ready before advanced search or autocomplete are used.

If Atlas Search is not ready, the backend returns a clean 503-style error rather than pretending the search succeeded.

## Known limitations

- Atlas Search indexes must be created manually in Atlas
- the frontend depends on index readiness to render advanced search results
- the public analytics route intentionally hides readable query text, even though the raw query is still sanitized and stored internally for operational analytics
- this project is a portfolio/demo implementation, not a multi-tenant SaaS search platform

## Summary

The Atlas Search configuration is intentionally simple and transparent:

- search relevance is supported using Atlas scoring
- fuzzy matching is available when enabled
- autocomplete uses a dedicated index
- category/tag filtering and facets are wired into the same backend contract
- the app keeps a stable fallback path using baseline MongoDB search when Atlas is unavailable
