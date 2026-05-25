import { stripHtmlTags } from '../utils/text';
import type { Tossup } from '../types/qb';
import { DIFFICULTY_PRESETS } from '../utils/difficulty';

const API_BASE = 'https://www.qbreader.org/api';
const DEFAULT_TOSSUP_COUNT = 1;
const MAX_TOSSUP_BATCH = 10;
const MOCK_ENABLED = process.env.EXPO_PUBLIC_QBREADER_MOCK === '1';
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

function isAbortError(error: unknown): boolean {
  return error instanceof Error && error.name === 'AbortError';
}

function createAbortError(): Error {
  const error = new Error('Request aborted');
  error.name = 'AbortError';
  return error;
}

function getRetryAfterMs(value: string | null): number | null {
  if (!value) return null;

  const seconds = Number.parseInt(value, 10);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return seconds * 1000;
  }

  const dateMs = Date.parse(value);
  if (Number.isFinite(dateMs)) {
    return Math.max(0, dateMs - Date.now());
  }

  return null;
}

async function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (ms <= 0) return;
  if (signal?.aborted) throw createAbortError();

  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      cleanup();
      resolve();
    }, ms);

    const onAbort = () => {
      cleanup();
      reject(createAbortError());
    };

    const cleanup = () => {
      clearTimeout(timeoutId);
      signal?.removeEventListener('abort', onAbort);
    };

    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/**
 * Build the QBReader random tossup URL with optional filters applied.
 */
export function buildRandomTossupUrl(count: number, filters?: RandomTossupFilters): string {
  const url = new URL(`${API_BASE}/random-tossup`);
  const normalizedCount = Number.isFinite(count)
    ? Math.min(MAX_TOSSUP_BATCH, Math.max(1, Math.floor(count)))
    : DEFAULT_TOSSUP_COUNT;
  url.searchParams.set('number', normalizedCount.toString());

  if (filters?.difficulties?.length) {
    url.searchParams.set('difficulties', filters.difficulties.join(','));
  }

  if (filters?.categories?.length) {
    url.searchParams.set('categories', filters.categories.join(','));
  }

  return url.toString();
}

async function fetchRandomTossupsRaw(
  count: number,
  signal?: AbortSignal,
  filters?: RandomTossupFilters
): Promise<RawTossup[]> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  let attempt = 0;
  let lastError: unknown;

  while (attempt < 3) {
    attempt += 1;
    try {
      const response = await fetch(buildRandomTossupUrl(count, filters), { signal });

      if (response.ok) {
        const payload = (await response.json()) as RandomTossupResponse | RawTossup[];
        return extractTossups(payload);
      }

      if (response.status === 429 || response.status >= 500) {
        if (attempt >= 3) {
          throw new Error('Unable to reach QB Reader right now.');
        }

        const retryAfterMs = getRetryAfterMs(response.headers.get('Retry-After'));
        const fallbackDelay = 250 * Math.pow(2, attempt - 1);
        const delay = Math.min(2000, retryAfterMs ?? fallbackDelay);
        await sleep(delay, signal);
        continue;
      }

      throw new Error('Unable to reach QB Reader right now.');
    } catch (error) {
      if (isAbortError(error)) {
        throw error;
      }
      lastError = error;

      if (attempt >= 3) {
        throw new Error('Unable to reach QB Reader right now.');
      }

      const delay = Math.min(2000, 250 * Math.pow(2, attempt - 1));
      await sleep(delay, signal);
    }
  }

  throw lastError instanceof Error ? lastError : new Error('Unable to reach QB Reader right now.');
}

/**
 * Fetch a single random tossup from QBReader, normalizing the response into the
 * app's Tossup shape. When EXPO_PUBLIC_QBREADER_MOCK=1, returns a deterministic
 * fixture instead — used by the /playtest loop so adversarial inputs aren't
 * confounded by API flake.
 */
export async function fetchRandomTossup(
  signal?: AbortSignal,
  filters?: RandomTossupFilters
): Promise<Tossup> {
  const [tossup] = await fetchRandomTossups(DEFAULT_TOSSUP_COUNT, signal, filters);
  return tossup;
}

/**
 * Fetch multiple random tossups from QBReader in a single request.
 */
export async function fetchRandomTossups(
  count: number,
  signal?: AbortSignal,
  filters?: RandomTossupFilters
): Promise<Tossup[]> {
  if (signal?.aborted) {
    throw createAbortError();
  }

  const normalizedCount = Number.isFinite(count)
    ? Math.min(MAX_TOSSUP_BATCH, Math.max(1, Math.floor(count)))
    : DEFAULT_TOSSUP_COUNT;

  if (MOCK_ENABLED) {
    return Array.from({ length: normalizedCount }, () => mockTossup());
  }

  const tossups = await fetchRandomTossupsRaw(normalizedCount, signal, filters);

  if (!tossups.length) {
    throw new Error('QB Reader did not return a tossup. Please try again.');
  }

  return tossups.map(normalizeTossup);
}

/**
 * Return the difficulty groupings used by QBReader tossup filters.
 */
export function getAvailableDifficulties(): DifficultyOption[] {
  return DIFFICULTY_PRESETS.map((preset) => ({
    label: preset.label,
    values: [...preset.values],
  }));
}

/**
 * Fetch available difficulty groupings.
 */
export async function fetchAvailableDifficulties(): Promise<DifficultyOption[]> {
  return getAvailableDifficulties();
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

export function normalizeTossup(raw: RawTossup): Tossup {
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
  return typeof rawNumber === 'number' && Number.isFinite(rawNumber) ? rawNumber : undefined;
}

function normalizeLabel(value?: string | { name?: string }): string | undefined {
  if (!value) return undefined;
  return typeof value === 'string' ? value : value.name ?? undefined;
}

// ─── Mock fixtures (used when EXPO_PUBLIC_QBREADER_MOCK=1) ────────────────────

const MOCK_FIXTURES: Tossup[] = [
  {
    id: 'mock-1',
    questionHtml:
      'This German-born physicist published four landmark papers in 1905, including one introducing special relativity. For 10 points, name this author of E=mc^2.',
    answerHtml: 'Albert <b>Einstein</b>',
    question:
      'This German-born physicist published four landmark papers in 1905, including one introducing special relativity. For 10 points, name this author of E=mc^2.',
    answer: 'Albert Einstein',
    category: 'Science',
    subcategory: 'Physics',
    difficulty: 3,
    setName: 'Mock Set',
    packetNumber: 1,
    questionNumber: 1,
  },
  {
    id: 'mock-2',
    questionHtml:
      'This English playwright wrote a tragedy about a Danish prince contemplating mortality. For 10 points, name this author of Hamlet.',
    answerHtml: 'William <b>Shakespeare</b>',
    question:
      'This English playwright wrote a tragedy about a Danish prince contemplating mortality. For 10 points, name this author of Hamlet.',
    answer: 'William Shakespeare',
    category: 'Literature',
    subcategory: 'British Literature',
    difficulty: 2,
    setName: 'Mock Set',
    packetNumber: 1,
    questionNumber: 2,
  },
  {
    id: 'mock-3',
    questionHtml:
      'This capital city sits on the Seine and is home to the Eiffel Tower. For 10 points, name this French city.',
    answerHtml: '<b>Paris</b>',
    question:
      'This capital city sits on the Seine and is home to the Eiffel Tower. For 10 points, name this French city.',
    answer: 'Paris',
    category: 'Geography',
    subcategory: 'European Geography',
    difficulty: 1,
    setName: 'Mock Set',
    packetNumber: 1,
    questionNumber: 3,
  },
];

let mockIndex = 0;

function mockTossup(): Tossup {
  const fixture = MOCK_FIXTURES[mockIndex % MOCK_FIXTURES.length];
  mockIndex += 1;
  return { ...fixture, id: `${fixture.id}-${mockIndex}` };
}
