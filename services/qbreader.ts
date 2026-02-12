import { stripHtmlTags } from '@/utils/text';
import type { Tossup } from '@/types/qb';

const API_BASE = 'https://www.qbreader.org/api';
const DEFAULT_TOSSUP_COUNT = 1;
const FALLBACK_CATEGORIES = [
  'Literature',
  'History',
  'Science',
  'Fine Arts',
  'Religion',
  'Mythology',
  'Philosophy',
  'Social Science',
  'Current Events',
  'Geography',
  'Other Academic',
  'Pop Culture',
];

const DIFFICULTY_GROUPS = [
  {
    label: 'Middle School',
    values: [1],
  },
  {
    label: 'High School',
    values: [2, 3, 4, 5],
  },
  {
    label: 'College',
    values: [6, 7, 8, 9, 10],
  },
];

interface RawPacket {
  number?: number;
}

interface RawSet {
  name?: string;
}

interface RawTossup {
  id?: string | number;
  _id?: string;
  question?: string;
  question_sanitized?: string;
  answer?: string;
  answer_sanitized?: string;
  category?: string | { name?: string };
  subcategory?: string | { name?: string };
  difficulty?: string | number;
  set?: RawSet | string;
  packet?: RawPacket | string;
  number?: number;
}

interface RandomTossupResponse {
  tossups?: RawTossup[];
  response_time?: number;
}

export type DifficultyOption = {
  label: string;
  values: number[];
};

export type CategoryOption = {
  name: string;
};

export type RandomTossupFilters = {
  difficulties?: number[];
  categories?: string[];
};

/**
 * Build the QBReader random tossup URL with optional filters applied.
 */
function buildRandomTossupUrl(filters?: RandomTossupFilters) {
  const url = new URL(`${API_BASE}/random-tossup`);
  url.searchParams.set('number', DEFAULT_TOSSUP_COUNT.toString());

  if (filters?.difficulties?.length) {
    url.searchParams.set('difficulties', filters.difficulties.join(','));
  }

  if (filters?.categories?.length) {
    url.searchParams.set('categories', filters.categories.join(','));
  }

  return url.toString();
}

/**
 * Fetch a single random tossup from QBReader, normalizing the response into the
 * app's Tossup shape.
 */
export async function fetchRandomTossup(
  signal?: AbortSignal,
  filters?: RandomTossupFilters
): Promise<Tossup> {
  const response = await fetch(buildRandomTossupUrl(filters), { signal });

  if (!response.ok) {
    throw new Error('Unable to reach QB Reader right now.');
  }

  const payload = (await response.json()) as RandomTossupResponse | RawTossup[];
  const tossups = extractTossups(payload);

  if (!tossups.length) {
    throw new Error('QB Reader did not return a tossup. Please try again.');
  }

  return normalizeTossup(tossups[0]);
}

/**
 * Fetch available difficulty groupings from QBReader.
 */
export async function fetchAvailableDifficulties(): Promise<DifficultyOption[]> {
  const response = await fetch(`${API_BASE}/db-explorer/set-metadata?includeCounts=false`);

  if (!response.ok) {
    throw new Error('Unable to load available difficulties.');
  }

  const payload = (await response.json()) as {
    data: Array<{ difficulty?: number }>;
  };

  const values = collectDifficultyValues(payload.data);
  const grouped = DIFFICULTY_GROUPS.filter((group) =>
    group.values.some((value) => values.has(value))
  );

  return (grouped.length > 0 ? grouped : DIFFICULTY_GROUPS).map((group) => ({
    label: group.label,
    values: group.values,
  }));
}

/**
 * Return the well-known QBReader categories. These are stable and don't need
 * an expensive network fetch (the previous implementation fetched 800 random
 * questions just to extract category names).
 */
export function getAvailableCategories(): CategoryOption[] {
  return [...FALLBACK_CATEGORIES]
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }));
}

/**
 * Fetch difficulties from the API and combine with the static category list.
 */
export async function fetchFilterOptions(): Promise<{
  difficulties: DifficultyOption[];
  categories: CategoryOption[];
}> {
  const difficulties = await fetchAvailableDifficulties();
  const categories = getAvailableCategories();
  return { difficulties, categories };
}

function collectDifficultyValues(data: Array<{ difficulty?: number }>): Set<number> {
  const values = new Set<number>();
  data.forEach((item) => {
    if (typeof item.difficulty === 'number') {
      values.add(item.difficulty);
    }
  });
  return values;
}

function extractTossups(payload: RandomTossupResponse | RawTossup[]): RawTossup[] {
  return Array.isArray(payload) && !('tossups' in payload)
    ? payload
    : (payload as RandomTossupResponse).tossups ?? [];
}

function cleanupPlainText(value: string): string {
  if (!value) {
    return '';
  }

  return value.replace(/\s*undefined\s*$/gi, '').trim();
}

function normalizeTossup(raw: RawTossup): Tossup {
  const id = resolveTossupId(raw);
  const questionHtml = raw.question ?? raw.question_sanitized ?? '';
  const answerHtml = raw.answer ?? raw.answer_sanitized ?? '';
  const setName = normalizeSetName(raw.set);
  const packetNumber = normalizePacketNumber(raw.packet);

  const questionPlainText = cleanupPlainText(
    raw.question_sanitized ?? stripHtmlTags(questionHtml)
  );
  const answerPlainText = cleanupPlainText(
    raw.answer_sanitized ?? stripHtmlTags(answerHtml)
  );

  return {
    id,
    questionHtml,
    answerHtml,
    question: questionPlainText,
    answer: answerPlainText,
    category: normalizeLabel(raw.category),
    subcategory: normalizeLabel(raw.subcategory),
    difficulty: raw.difficulty,
    setName,
    packetNumber,
    questionNumber: raw.number,
  };
}

function resolveTossupId(raw: RawTossup): string {
  return String(raw.id ?? raw._id ?? `${Date.now()}`);
}

function normalizeSetName(set?: RawSet | string): string | undefined {
  return typeof set === 'string' ? set : set?.name ?? undefined;
}

function normalizePacketNumber(packet?: RawPacket | string): number | undefined {
  const rawNumber =
    typeof packet === 'string' ? Number.parseInt(packet, 10) : packet?.number;
  return rawNumber && Number.isFinite(rawNumber) ? rawNumber : undefined;
}

function normalizeLabel(value?: string | { name?: string }): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.name ?? undefined;
}
