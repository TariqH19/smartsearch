/**
 * Mirrors the repository's default projection for assertions in tests.
 *
 * Kept in one place so tests can verify "all default fields plus score"
 * without importing private module state.
 */
export const DEFAULT_PROJECTION_FOR_TESTS = {
  _id: 1,
  title: 1,
  description: 1,
  category: 1,
  tags: 1,
  author: 1,
  createdAt: 1,
  updatedAt: 1,
} as const;