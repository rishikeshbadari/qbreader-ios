import type { Tossup } from '@/types/qb';

export type QuestionInfoRow = {
  label: string;
  value: string;
};

function formatValue(value: unknown): string | undefined {
  if (value == null) return undefined;
  const text = String(value).trim();
  return text.length > 0 ? text : undefined;
}

function formatPacket(tossup: Tossup): string | undefined {
  const packetName = formatValue(tossup.packetName);
  const packetNumber =
    typeof tossup.packetNumber === 'number' && Number.isFinite(tossup.packetNumber)
      ? tossup.packetNumber
      : undefined;
  const packetNameMatchesNumber =
    packetName != null &&
    packetNumber != null &&
    Number.parseInt(packetName, 10) === packetNumber;

  if (packetName && packetNumber != null && !packetNameMatchesNumber) {
    return `${packetName} (#${packetNumber})`;
  }

  return packetName ?? (packetNumber != null ? String(packetNumber) : undefined);
}

function formatUpdatedDate(value?: string): string | undefined {
  const timestamp = value ? Date.parse(value) : Number.NaN;
  if (!Number.isFinite(timestamp)) return undefined;
  return new Date(timestamp).toISOString().slice(0, 10);
}

export function getQuestionInfoRows(tossup?: Tossup | null): QuestionInfoRow[] {
  if (!tossup) return [];

  const setName = formatValue(tossup.setName);
  const setYear =
    typeof tossup.setYear === 'number' && Number.isFinite(tossup.setYear)
      ? String(tossup.setYear)
      : undefined;
  const packet = formatPacket(tossup);
  const questionNumber =
    typeof tossup.questionNumber === 'number' && Number.isFinite(tossup.questionNumber)
      ? String(tossup.questionNumber)
      : undefined;
  const difficulty = formatValue(tossup.difficulty);
  const category = formatValue(tossup.category);
  const subcategory = formatValue(tossup.subcategory);
  const updated = formatUpdatedDate(tossup.updatedAt);

  return [
    setName ? { label: 'Set', value: setName } : undefined,
    setYear ? { label: 'Year', value: setYear } : undefined,
    packet ? { label: 'Packet', value: packet } : undefined,
    questionNumber ? { label: 'Question', value: questionNumber } : undefined,
    difficulty ? { label: 'Difficulty', value: difficulty } : undefined,
    category ? { label: 'Category', value: category } : undefined,
    subcategory ? { label: 'Subcategory', value: subcategory } : undefined,
    updated ? { label: 'Updated', value: updated } : undefined,
  ].filter(Boolean) as QuestionInfoRow[];
}
