/**
 * Atlas Search index definitions for the `documents` collection.
 *
 * The index name must match `ATLAS_SEARCH_INDEX_NAME` and the name used when
 * creating the index in Atlas (or via the Atlas Administration API).
 *
 * This module contains no secrets and is safe to commit. It does not connect to
 * Atlas; it only describes the index shapes.
 *
 * Live vs rollback:
 * - `DOCUMENTS_SEARCH_INDEX` is the LIVE definition deployed on
 *   `documents_search` (verified by reading the stored mapping back).
 * - `DOCUMENTS_SEARCH_INDEX_STANDARD_ROLLBACK` is the previous definition, kept
 *   so the index can be reverted if the English analyzer or the `token` mappings
 *   cause problems. See docs/atlas-search.md §1.3.
 */

export const ATLAS_SEARCH_INDEX_NAME = "documents_search";

export interface SearchIndexFieldMapping {
  type: string;
  analyzer?: string;
  multi?: unknown;
  fields?: Record<string, SearchIndexFieldMapping>;
  /** Autocomplete-only settings. */
  tokenization?: string;
  minGrams?: number;
  maxGrams?: number;
  /** Token-type normalizer (`lowercase` or `none`). */
  normalizer?: string;
}

/**
 * A field may be indexed as several types at once. MongoDB requires a `token`
 * mapping alongside `string` when the same field must support both the `text`
 * operator and faceting.
 */
export type SearchIndexFieldDefinition =
  | SearchIndexFieldMapping
  | SearchIndexFieldMapping[];

export interface SearchIndexDefinition {
  name: string;
  mappings: {
    dynamic: boolean;
    fields: Record<string, SearchIndexFieldDefinition>;
  };
}

/**
 * The LIVE `documents_search` definition.
 *
 * - title/description/content: `string` with the `lucene.english` analyzer, so
 *   inflections fold together (`pipeline` matches `pipelines`, `secure` matches
 *   `security`).
 * - category/tags: indexed twice. The `string` + `lucene.keyword` entry keeps the
 *   `text` filters working; the `token` entry is what the `facet` collector
 *   requires. Without the `token` entry Atlas rejects facet queries with
 *   "not indexed as a token field of a document type".
 * - createdAt: `date` for range filtering and sorting.
 */
export const DOCUMENTS_SEARCH_INDEX: SearchIndexDefinition = {
  name: ATLAS_SEARCH_INDEX_NAME,
  mappings: {
    dynamic: false,
    fields: {
      title: {
        type: "string",
        analyzer: "lucene.english",
      },
      description: {
        type: "string",
        analyzer: "lucene.english",
      },
      content: {
        type: "string",
        analyzer: "lucene.english",
      },
      category: [
        { type: "string", analyzer: "lucene.keyword" },
        { type: "token", normalizer: "lowercase" },
      ],
      tags: [
        { type: "string", analyzer: "lucene.keyword" },
        { type: "token", normalizer: "lowercase" },
      ],
      createdAt: {
        type: "date",
      },
    },
  },
};

/**
 * The PREVIOUS `documents_search` definition, retained as the rollback target.
 *
 * It is identical to the live mapping except that the full-text fields use
 * `lucene.standard`, which does not stem, and `category`/`tags` are plain
 * `string` fields, which cannot be faceted. Restoring this definition is the
 * documented rollback (docs/atlas-search.md §1.3); it also disables facets.
 */
export const DOCUMENTS_SEARCH_INDEX_STANDARD_ROLLBACK: SearchIndexDefinition = {
  name: ATLAS_SEARCH_INDEX_NAME,
  mappings: {
    dynamic: false,
    fields: {
      title: {
        type: "string",
        analyzer: "lucene.standard",
      },
      description: {
        type: "string",
        analyzer: "lucene.standard",
      },
      content: {
        type: "string",
        analyzer: "lucene.standard",
      },
      category: {
        type: "string",
        analyzer: "lucene.keyword",
      },
      tags: {
        type: "string",
        analyzer: "lucene.keyword",
      },
      createdAt: {
        type: "date",
      },
    },
  },
};

/**
 * Autocomplete index definition, kept separate so it can be documented and
 * created independently of the core search index.
 *
 * This index is unchanged by the English-analyzer migration: autocomplete uses
 * its own `edgeGram` tokenization and is not affected by stemming.
 */
export const DOCUMENTS_AUTOCOMPLETE_INDEX: SearchIndexDefinition = {
  name: "documents_autocomplete",
  mappings: {
    dynamic: false,
    fields: {
      title: {
        type: "autocomplete",
        analyzer: "lucene.standard",
        tokenization: "edgeGram",
        minGrams: 2,
        maxGrams: 20,
      },
    },
  },
};