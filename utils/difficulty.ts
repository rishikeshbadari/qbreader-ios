export type DifficultyPreset = {
  label: string;
  shortLabel: string;
  values: number[];
};

export const DIFFICULTY_VALUES = Array.from({ length: 10 }, (_, index) => index + 1);

export const DIFFICULTY_PRESETS: DifficultyPreset[] = [
  {
    label: 'Middle School',
    shortLabel: 'Middle',
    values: [1],
  },
  {
    label: 'High School',
    shortLabel: 'High',
    values: [2, 3, 4, 5],
  },
  {
    label: 'College',
    shortLabel: 'College',
    values: [6, 7, 8, 9, 10],
  },
];

export function normalizeDifficultyValues(values: number[]): number[] {
  const allowed = new Set(DIFFICULTY_VALUES);
  return Array.from(
    new Set(
      values.filter((value) => Number.isInteger(value) && allowed.has(value))
    )
  ).sort((left, right) => left - right);
}

export function areDifficultySelectionsEqual(left: number[], right: number[]): boolean {
  const normalizedLeft = normalizeDifficultyValues(left);
  const normalizedRight = normalizeDifficultyValues(right);
  return (
    normalizedLeft.length === normalizedRight.length &&
    normalizedLeft.every((value, index) => value === normalizedRight[index])
  );
}

function isContiguous(values: number[]): boolean {
  return values.every((value, index) => index === 0 || value === values[index - 1] + 1);
}

export function getDifficultySelectionLabel(values: number[]): string {
  const normalized = normalizeDifficultyValues(values);

  if (normalized.length === 0) {
    return 'No levels';
  }

  if (areDifficultySelectionsEqual(normalized, DIFFICULTY_VALUES)) {
    return 'All levels';
  }

  if (normalized.length === 1) {
    return `Level ${normalized[0]}`;
  }

  const preset = DIFFICULTY_PRESETS.find((option) =>
    areDifficultySelectionsEqual(normalized, option.values)
  );
  if (preset) {
    return preset.label;
  }

  if (isContiguous(normalized)) {
    return `Levels ${normalized[0]}-${normalized[normalized.length - 1]}`;
  }

  if (normalized.length <= 5) {
    return `Levels ${normalized.join(', ')}`;
  }

  return `${normalized.length} levels`;
}
