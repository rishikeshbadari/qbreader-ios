import { stripHtmlTags } from '@/utils/text';
import type { Tossup } from '@/types/qb';

const API_BASE = 'https://www.qbreader.org/api';

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

export async function fetchRandomTossup(signal?: AbortSignal): Promise<Tossup> {
  const response = await fetch(`${API_BASE}/random-tossup?limit=1`, { signal });

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

  return {
    id,
    questionHtml,
    answerHtml,
    question: raw.question_sanitized ?? stripHtmlTags(questionHtml),
    answer: raw.answer_sanitized ?? stripHtmlTags(answerHtml),
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
