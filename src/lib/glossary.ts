export type GlossaryCategory =
  | 'valuation'
  | 'quality'
  | 'technical'
  | 'risk'
  | 'general';

export interface GlossaryTerm {
  id: string;
  term_en: string;
  term_de: string;
  definition_short: string;
  definition_long: string;
  analogy: string;
  category: GlossaryCategory;
  related_terms: string[];
  used_in_pillars: string[];
}

interface GlossaryPayload {
  terms: GlossaryTerm[];
}

const EMPTY_GLOSSARY: GlossaryPayload = { terms: [] };

let glossaryCache: GlossaryPayload | null = null;
let glossaryByIdCache: Map<string, GlossaryTerm> | null = null;
let glossaryLoadPromise: Promise<GlossaryPayload> | null = null;

function isGlossaryTerm(value: unknown): value is GlossaryTerm {
  if (typeof value !== 'object' || value === null) return false;
  const record = value as Record<string, unknown>;
  return (
    typeof record.id === 'string'
    && typeof record.term_en === 'string'
    && typeof record.term_de === 'string'
    && typeof record.definition_short === 'string'
    && typeof record.definition_long === 'string'
    && typeof record.analogy === 'string'
    && typeof record.category === 'string'
    && Array.isArray(record.related_terms)
    && Array.isArray(record.used_in_pillars)
  );
}

async function loadGlossary(): Promise<GlossaryPayload> {
  if (glossaryCache) {
    return glossaryCache;
  }
  if (!glossaryLoadPromise) {
    glossaryLoadPromise = import('../../data/glossary.json')
      .then((module) => {
        const unknownPayload: unknown = module.default ?? module;
        const terms = (
          typeof unknownPayload === 'object'
          && unknownPayload !== null
          && Array.isArray((unknownPayload as { terms?: unknown }).terms)
            ? (unknownPayload as { terms: unknown[] }).terms
            : []
        )
          .filter(isGlossaryTerm)
          .map((term) => ({
            ...term,
            id: term.id.toLowerCase(),
          }));

        const payload: GlossaryPayload = { terms };
        glossaryCache = payload;
        glossaryByIdCache = new Map(payload.terms.map((term) => [term.id, term]));
        if (process.env.NODE_ENV !== 'production') {
          console.info(`[Glossary][Codex] Loaded ${payload.terms.length} terms from data/glossary.json`);
        }
        return payload;
      })
      .catch((error: unknown) => {
        console.error('[Glossary][Codex] Failed to load glossary data:', error);
        glossaryCache = EMPTY_GLOSSARY;
        glossaryByIdCache = new Map();
        return EMPTY_GLOSSARY;
      });
  }
  return glossaryLoadPromise;
}

export async function getGlossaryTerm(id: string): Promise<GlossaryTerm | null> {
  const normalized = id.trim().toLowerCase();
  if (!normalized) return null;
  await loadGlossary();
  return glossaryByIdCache?.get(normalized) ?? null;
}

export async function searchGlossary(query: string): Promise<GlossaryTerm[]> {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return [];
  const { terms } = await loadGlossary();
  return terms.filter((term) => {
    const haystack = [
      term.id,
      term.term_en,
      term.term_de,
      term.definition_short,
      term.definition_long,
    ]
      .join(' ')
      .toLowerCase();
    return haystack.includes(normalized);
  });
}

export async function getTermsByCategory(category: string): Promise<GlossaryTerm[]> {
  const normalized = category.trim().toLowerCase();
  if (!normalized) return [];
  const { terms } = await loadGlossary();
  return terms.filter((term) => term.category === normalized);
}
