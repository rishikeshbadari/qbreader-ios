export const DEFAULT_REVEAL_SPEED = 0.5;

export type PersistedSettings = {
  difficulties?: number[];
  categories?: string[];
  revealSpeed?: number;
};

export type SelectionUpdate<T> = {
  selection: T[];
  error?: string;
};

export function clampRevealSpeed(value: number): number {
  return Math.min(1, Math.max(0, value));
}

export function isPersistedSettings(value: unknown): value is PersistedSettings {
  if (!value || typeof value !== 'object') {
    return false;
  }

  const candidate = value as PersistedSettings;
  const hasValidDifficulties =
    candidate.difficulties === undefined ||
    (
      Array.isArray(candidate.difficulties) &&
      candidate.difficulties.every((difficulty) => typeof difficulty === 'number')
    );
  const hasValidCategories =
    candidate.categories === undefined ||
    (
      Array.isArray(candidate.categories) &&
      candidate.categories.every((category) => typeof category === 'string')
    );
  const hasValidRevealSpeed =
    candidate.revealSpeed === undefined ||
    (typeof candidate.revealSpeed === 'number' && Number.isFinite(candidate.revealSpeed));

  return hasValidDifficulties && hasValidCategories && hasValidRevealSpeed;
}

export function parsePersistedSettings(stored: string): PersistedSettings {
  const parsed = JSON.parse(stored) as unknown;
  return isPersistedSettings(parsed) ? parsed : {};
}

export function resolveDifficultySelection(
  availableValues: number[],
  previousValues: number[],
  persistedValues?: number[],
): number[] {
  const persisted = persistedValues?.filter((value) => availableValues.includes(value));
  if (persisted && persisted.length > 0) {
    return persisted;
  }

  if (previousValues.length === 0) {
    return availableValues;
  }

  const filtered = previousValues.filter((value) => availableValues.includes(value));
  return filtered.length > 0 ? filtered : availableValues;
}

export function resolveCategorySelection(
  availableNames: string[],
  previousNames: string[],
  persistedNames?: string[],
): string[] {
  const availableNamesSet = new Set(availableNames);
  const persisted = persistedNames?.filter((name) => availableNamesSet.has(name));
  if (persisted && persisted.length > 0) {
    return persisted;
  }

  if (previousNames.length === 0) {
    return availableNames;
  }

  const filtered = previousNames.filter((name) => availableNamesSet.has(name));
  return filtered.length > 0 ? filtered : availableNames;
}

export function resolveRevealSpeed(persistedSpeed?: number): number {
  return typeof persistedSpeed === 'number' && Number.isFinite(persistedSpeed)
    ? clampRevealSpeed(persistedSpeed)
    : DEFAULT_REVEAL_SPEED;
}

export function toggleDifficultySelection(
  previousValues: number[],
  values: number[],
): SelectionUpdate<number> {
  const valueSet = new Set(values);
  const isFullySelected = values.every((value) => previousValues.includes(value));

  if (isFullySelected) {
    const remaining = previousValues.filter((value) => !valueSet.has(value));
    if (remaining.length === 0) {
      return { selection: previousValues, error: 'Select at least one difficulty.' };
    }
    return { selection: remaining };
  }

  return {
    selection: Array.from(new Set([...previousValues, ...values])).sort((a, b) => a - b),
  };
}

export function toggleCategorySelection(
  previousNames: string[],
  name: string,
): SelectionUpdate<string> {
  if (previousNames.includes(name)) {
    if (previousNames.length === 1) {
      return { selection: previousNames, error: 'Select at least one category.' };
    }
    return { selection: previousNames.filter((item) => item !== name) };
  }

  return {
    selection: [...previousNames, name].sort((a, b) => a.localeCompare(b)),
  };
}
