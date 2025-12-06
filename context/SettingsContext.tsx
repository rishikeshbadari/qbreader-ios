import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  fetchFilterOptions,
  type CategoryOption,
  type DifficultyOption,
} from '@/services/qbreader';

type SettingsContextValue = {
  availableDifficulties: DifficultyOption[];
  availableCategories: CategoryOption[];
  selectedDifficulties: number[];
  selectedCategories: string[];
  loadingOptions: boolean;
  loadError?: string;
  refreshOptions: () => void;
  toggleDifficulty: (values: number[]) => void;
  toggleCategory: (name: string) => void;
  selectAllDifficulties: () => void;
  selectAllCategories: () => void;
  selectionErrors: {
    difficulty?: string;
    category?: string;
  };
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);

export function SettingsProvider({ children }: PropsWithChildren) {
  const [availableDifficulties, setAvailableDifficulties] = useState<DifficultyOption[]>([]);
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>([]);
  const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>([]);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [loadingOptions, setLoadingOptions] = useState(false);
  const [loadError, setLoadError] = useState<string>();
  const [selectionErrors, setSelectionErrors] = useState<{
    difficulty?: string;
    category?: string;
  }>({});

  const clearSelectionError = useCallback((type: 'difficulty' | 'category') => {
    setSelectionErrors((prev) => ({
      ...prev,
      [type]: undefined,
    }));
  }, []);

  const setSelectionError = useCallback((type: 'difficulty' | 'category', message: string) => {
    setSelectionErrors((prev) => ({
      ...prev,
      [type]: message,
    }));
  }, []);

  const applyDefaults = useCallback(
    (difficulties: DifficultyOption[], categories: CategoryOption[]) => {
      const flattenedDifficulties = difficulties.flatMap((option) => option.values);
      setSelectedDifficulties((prev) => {
        if (prev.length === 0) {
          return flattenedDifficulties;
        }

        const filtered = prev.filter((value) =>
          flattenedDifficulties.includes(value)
        );
        return filtered.length > 0 ? filtered : flattenedDifficulties;
      });
      clearSelectionError('difficulty');

      setSelectedCategories((prev) => {
        if (prev.length === 0) {
          return categories.map((option) => option.name);
        }

        const filtered = prev.filter((name) =>
          categories.some((option) => option.name === name)
        );
        return filtered.length > 0 ? filtered : categories.map((option) => option.name);
      });
      clearSelectionError('category');
    },
    [clearSelectionError]
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setLoadError(undefined);

    try {
      const { difficulties, categories } = await fetchFilterOptions();
      setAvailableDifficulties(difficulties);
      setAvailableCategories(categories);
      applyDefaults(difficulties, categories);
    } catch (error) {
      console.error('Failed to load filter options', error);
      setLoadError(
        error instanceof Error ? error.message : 'Unable to load filter options.'
      );
    } finally {
      setLoadingOptions(false);
    }
  }, [applyDefaults]);

  useEffect(() => {
    void loadOptions();
  }, [loadOptions]);

  const toggleDifficulty = useCallback(
    (values: number[]) => {
      const valueSet = new Set(values);
      setSelectedDifficulties((prev) => {
        const isFullySelected = values.every((value) => prev.includes(value));
        if (isFullySelected) {
          const remaining = prev.filter((value) => !valueSet.has(value));
          if (remaining.length === 0) {
            setSelectionError('difficulty', 'Select at least one difficulty.');
            return prev;
          }
          clearSelectionError('difficulty');
          return remaining;
        }

        clearSelectionError('difficulty');
        const merged = Array.from(new Set([...prev, ...values])).sort((a, b) => a - b);
        return merged;
      });
    },
    [clearSelectionError, setSelectionError]
  );

  const toggleCategory = useCallback(
    (name: string) => {
      setSelectedCategories((prev) => {
        if (prev.includes(name)) {
          if (prev.length === 1) {
            setSelectionError('category', 'Select at least one category.');
            return prev;
          }
          clearSelectionError('category');
          return prev.filter((item) => item !== name);
        }
        clearSelectionError('category');
        return [...prev, name].sort((a, b) => a.localeCompare(b));
      });
    },
    [clearSelectionError, setSelectionError]
  );

  const selectAllDifficulties = useCallback(() => {
    setSelectedDifficulties(
      availableDifficulties.flatMap((option) => option.values)
    );
    clearSelectionError('difficulty');
  }, [availableDifficulties, clearSelectionError]);

  const selectAllCategories = useCallback(() => {
    setSelectedCategories(availableCategories.map((option) => option.name));
    clearSelectionError('category');
  }, [availableCategories, clearSelectionError]);

  const value = useMemo<SettingsContextValue>(
    () => ({
      availableDifficulties,
      availableCategories,
      selectedDifficulties,
      selectedCategories,
      loadingOptions,
      loadError,
      refreshOptions: loadOptions,
      toggleDifficulty,
      toggleCategory,
      selectAllDifficulties,
      selectAllCategories,
      selectionErrors,
    }),
    [
      availableCategories,
      availableDifficulties,
      loadError,
      loadingOptions,
      loadOptions,
      selectAllCategories,
      selectAllDifficulties,
      selectedCategories,
      selectedDifficulties,
      selectionErrors,
      toggleCategory,
      toggleDifficulty,
    ]
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useSettingsContext() {
  const context = useContext(SettingsContext);

  if (!context) {
    throw new Error('useSettingsContext must be used within the SettingsProvider');
  }

  return context;
}
