import { stripHtmlTags } from '@/utils/text';
import type { Tossup } from '@/types/qb';

const API_BASE = 'https://www.qbreader.org/api';
const CATEGORY_SAMPLE_SIZE = 800;

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

interface QueryResponse {
  tossups?: {
    questionArray: RawTossup[];
  };
  bonuses?: {
    questionArray: Array<
      RawTossup & {
        alternate_subcategory?: string | { name?: string };
      }
    >;
  };
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

function buildRandomTossupUrl(filters?: RandomTossupFilters) {
  const url = new URL(`${API_BASE}/random-tossup`);
  url.searchParams.set('number', '1');

  if (filters?.difficulties?.length) {
    url.searchParams.set('difficulties', filters.difficulties.join(','));
  }

  if (filters?.categories?.length) {
    url.searchParams.set('categories', filters.categories.join(','));
  }

  return url.toString();
}

export async function fetchRandomTossup(
  signal?: AbortSignal,
  filters?: RandomTossupFilters
): Promise<Tossup> {
  const response = await fetch(buildRandomTossupUrl(filters), { signal });

  if (!response.ok) {
    throw new Error('Unable to reach QB Reader right now.');
  }

  const payload = (await response.json()) as RandomTossupResponse | RawTossup[];
  const tossups =
    Array.isArray(payload) && !('tossups' in payload)
      ? payload
      : (payload as RandomTossupResponse).tossups ?? [];

  if (!tossups.length) {
    throw new Error('QB Reader did not return a tossup. Please try again.');
  }

  return normalizeTossup(tossups[0]);
}

export async function fetchAvailableDifficulties(): Promise<DifficultyOption[]> {
  const response = await fetch(`${API_BASE}/db-explorer/set-metadata?includeCounts=false`);

  if (!response.ok) {
    throw new Error('Unable to load available difficulties.');
  }

  const payload = (await response.json()) as {
    data: Array<{ difficulty?: number }>;
  };

  const values = new Set<number>();
  payload.data.forEach((item) => {
    if (typeof item.difficulty === 'number') {
      values.add(item.difficulty);
    }
  });

  const grouped = DIFFICULTY_GROUPS.filter((group) =>
    group.values.some((value) => values.has(value))
  );

  return (grouped.length > 0 ? grouped : DIFFICULTY_GROUPS).map((group) => ({
    label: group.label,
    values: group.values,
  }));
}

export async function fetchAvailableCategories(): Promise<CategoryOption[]> {
  const url = new URL(`${API_BASE}/query`);
  url.searchParams.set('maxReturnLength', CATEGORY_SAMPLE_SIZE.toString());
  url.searchParams.set('randomize', 'true');

  const response = await fetch(url.toString());

  if (!response.ok) {
    throw new Error('Unable to load categories.');
  }

  const payload = (await response.json()) as QueryResponse;
  const categories = new Set<string>();

  const collectCategory = (value?: string | { name?: string }) => {
    if (!value) {
      return;
    }

    if (typeof value === 'string') {
      categories.add(value);
      return;
    }

    if (value.name) {
      categories.add(value.name);
    }
  };

  payload.tossups?.questionArray.forEach((question) => {
    collectCategory(question.category);
  });

  payload.bonuses?.questionArray.forEach((question) => {
    collectCategory(question.category);
  });

  if (categories.size === 0) {
    [
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
    ].forEach((name) => categories.add(name));
  }

  return Array.from(categories)
    .filter(Boolean)
    .sort((a, b) => a.localeCompare(b))
    .map((name) => ({ name }));
}

export async function fetchFilterOptions(): Promise<{
  difficulties: DifficultyOption[];
  categories: CategoryOption[];
}> {
  const [difficulties, categories] = await Promise.all([
    fetchAvailableDifficulties(),
    fetchAvailableCategories(),
  ]);

  return { difficulties, categories };
}

function cleanupPlainText(value: string): string {
  if (!value) {
    return '';
  }

  return value.replace(/\s*undefined\s*$/gi, '').trim();
}

function normalizeTossup(raw: RawTossup): Tossup {
  const id = String(raw.id ?? raw._id ?? `${Date.now()}`);
  const questionHtml = raw.question ?? raw.question_sanitized ?? '';
  const answerHtml = raw.answer ?? raw.answer_sanitized ?? '';
  const setName =
    typeof raw.set === 'string' ? raw.set : raw.set?.name ?? undefined;
  const packetNumber =
    typeof raw.packet === 'string'
      ? Number.parseInt(raw.packet, 10)
      : raw.packet?.number;

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
    category:
      typeof raw.category === 'string' ? raw.category : raw.category?.name,
    subcategory:
      typeof raw.subcategory === 'string'
        ? raw.subcategory
        : raw.subcategory?.name,
    difficulty: raw.difficulty,
    setName,
    packetNumber: packetNumber && Number.isFinite(packetNumber) ? packetNumber : undefined,
    questionNumber: raw.number,
  };
}
