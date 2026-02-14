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

let glossaryCache: GlossaryPayload | null = null;
let glossaryByIdCache: Map<string, GlossaryTerm> | null = null;
let glossaryLoadPromise: Promise<GlossaryPayload> | null = null;

async function loadGlossary(): Promise<GlossaryPayload> {
  if (glossaryCache) {
    return glossaryCache;
  }
  if (!glossaryLoadPromise) {
    glossaryLoadPromise = import('../../data/glossary.json').then((module) => {
      const payload = (module.default ?? module) as GlossaryPayload;
      glossaryCache = payload;
      glossaryByIdCache = new Map(payload.terms.map((term) => [term.id.toLowerCase(), term]));
      return payload;
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
