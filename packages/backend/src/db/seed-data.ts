import {
  DOCUMENT_CATEGORIES,
  type DocumentCategory,
  type DocumentRecord,
} from "../models/document.js";

export interface SeedOptions {
  count?: number;
  /** Fixed reference point so generated data is reproducible. */
  now?: Date;
}

const AUTHORS = [
  "Amara Okafor",
  "Liam Fitzgerald",
  "Priya Raman",
  "Noah Bergstrom",
  "Sofia Marchetti",
  "Kenji Watanabe",
  "Elena Petrova",
  "Marcus Bell",
  "Zainab Al-Hassan",
  "Oliver Grant",
  "Camila Duarte",
  "Hannah Kim",
] as const;

const TAGS_BY_CATEGORY: Record<DocumentCategory, readonly string[]> = {
  engineering: [
    "typescript",
    "nodejs",
    "api-design",
    "testing",
    "refactoring",
    "performance",
  ],
  data: ["mongodb", "aggregation", "pipelines", "analytics", "modelling", "migration"],
  devops: ["docker", "kubernetes", "ci-cd", "observability", "deployment", "automation"],
  security: ["authentication", "encryption", "secrets", "compliance", "threat-modeling", "headers"],
  design: ["ux", "design-systems", "accessibility", "typography", "colour", "prototyping"],
  product: ["roadmap", "discovery", "prioritisation", "metrics", "stakeholders", "strategy"],
};

const TITLE_TEMPLATES = [
  "A Practical Guide to {topic}",
  "Understanding {topic} in Production",
  "{topic}: Patterns and Pitfalls",
  "Scaling {topic} Without the Guesswork",
  "Notes on {topic}",
  "Rethinking {topic}",
  "Field Report: {topic}",
  "Getting {topic} Right the First Time",
] as const;

const TOPICS_BY_CATEGORY: Record<DocumentCategory, readonly string[]> = {
  engineering: [
    "typed API contracts",
    "dependency injection",
    "error boundaries",
    "background jobs",
    "idempotent handlers",
    "request validation",
  ],
  data: [
    "schema design for search",
    "aggregation pipelines",
    "index selectivity",
    "change streams",
    "sharding keys",
    "replica set reads",
  ],
  devops: [
    "zero-downtime deploys",
    "container health checks",
    "log aggregation",
    "infrastructure as code",
    "canary releases",
    "secret rotation",
  ],
  security: [
    "token storage",
    "rate limiting",
    "input sanitisation",
    "least-privilege access",
    "audit logging",
    "threat modelling",
  ],
  design: [
    "accessible colour contrast",
    "design tokens",
    "empty states",
    "responsive typography",
    "keyboard navigation",
    "loading feedback",
  ],
  product: [
    "discovery interviews",
    "north-star metrics",
    "roadmap trade-offs",
    "feature flags",
    "user segmentation",
    "launch checklists",
  ],
};

const DESCRIPTION_TEMPLATES = [
  "A concise walkthrough covering the decisions, trade-offs and concrete examples that matter when applying {topic} day to day.",
  "How we approached {topic}, what broke along the way, and the safeguards that kept the system predictable.",
  "Practical guidance on {topic}, with an emphasis on measurable outcomes rather than tooling for its own sake.",
  "An opinionated look at {topic}: the defaults worth keeping, the ones worth challenging, and why.",
  "Lessons from operating {topic} at scale, including the failure modes that are easy to miss in review.",
] as const;

const PARAGRAPHS = [
  "The core idea is straightforward, but the details decide whether the approach holds up under real traffic. Teams frequently underestimate the cost of edge cases until they appear in production.",
  "Measurement comes first. Without a baseline it is impossible to tell whether a change helped, hurt, or simply moved the bottleneck somewhere less visible.",
  "Keep the happy path boring. Every deviation from the simplest working solution should be justified by evidence, not by anticipation of problems that may never arrive.",
  "Document the trade-off at the moment the decision is made. Six months later the context that made the choice obvious will be gone, and the reasoning will look arbitrary.",
  "Automate the verification step. If confirming correctness requires manual effort, it will eventually be skipped, and the resulting regressions are expensive to unwind.",
  "Design for the second year, not the first week. The shortcuts that save an afternoon now tend to consume weeks later when requirements expand.",
  "Prefer explicit configuration over implicit convention. Discoverability matters more than brevity when someone else inherits the system.",
  "Instrument before optimising. Intuition about where time is spent is unreliable, and profiling usually reveals a surprise or two.",
] as const;

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic PRNG so generated datasets are identical across runs. */
function mulberry32(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pick<T>(items: readonly T[], random: () => number): T {
  const index = Math.floor(random() * items.length);
  return items[index] as T;
}

function shuffle<T>(items: readonly T[], random: () => number): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    const a = copy[i] as T;
    const b = copy[j] as T;
    copy[i] = b;
    copy[j] = a;
  }
  return copy;
}

function buildContent(topic: string, category: DocumentCategory, random: () => number): string {
  const paragraphs = shuffle(PARAGRAPHS, random).slice(0, 4);
  return [
    `${topic} sits at the intersection of ${category} practice and day-to-day delivery. This note captures the essentials.`,
    ...paragraphs,
  ].join("\n\n");
}

/**
 * Generates a deterministic set of documents.
 *
 * The `_id` is derived from the sequence number, which is what makes reruns
 * safe: the same inputs always produce the same `_id`s, so an upsert converges
 * instead of duplicating.
 */
export function generateDocuments(options: SeedOptions = {}): DocumentRecord[] {
  const count = options.count ?? 200;
  const now = options.now ?? new Date("2026-01-01T00:00:00.000Z");
  const random = mulberry32(hashString("smartsearch-seed-v1"));

  const documents: DocumentRecord[] = [];

  for (let i = 0; i < count; i += 1) {
    const sequence = String(i + 1).padStart(4, "0");
    const category = DOCUMENT_CATEGORIES[i % DOCUMENT_CATEGORIES.length] as DocumentCategory;
    const topic = pick(TOPICS_BY_CATEGORY[category], random);
    const title = pick(TITLE_TEMPLATES, random).replace("{topic}", topic);
    const description = pick(DESCRIPTION_TEMPLATES, random).replace("{topic}", topic);

    const tagPool = TAGS_BY_CATEGORY[category];
    const tagCount = 2 + Math.floor(random() * 3);
    const tags = shuffle(tagPool, random).slice(0, tagCount);

    const daysAgo = Math.floor(random() * 540);
    const createdAt = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000);
    const updatedOffset = Math.floor(random() * Math.min(daysAgo, 30));
    const updatedAt = new Date(createdAt.getTime() + updatedOffset * 24 * 60 * 60 * 1000);

    documents.push({
      _id: `doc-${sequence}`,
      title,
      description,
      content: buildContent(topic, category, random),
      category,
      tags,
      author: pick(AUTHORS, random),
      createdAt,
      updatedAt,
    });
  }

  return documents;
}