import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import {
  fetchFilterOptions,
  getAvailableCategories,
  getAvailableDifficulties,
  type CategoryOption,
  type DifficultyOption,
} from '@/services/qbreader';

type SettingsContextValue = {
  availableDifficulties: DifficultyOption[];
  availableCategories: CategoryOption[];
  selectedDifficulties: number[];
  selectedCategories: string[];
  revealSpeed: number;
  loadingOptions: boolean;
  loadError?: string;
  refreshOptions: () => void;
  toggleDifficulty: (values: number[]) => void;
  toggleCategory: (name: string) => void;
  selectAllDifficulties: () => void;
  selectAllCategories: () => void;
  setRevealSpeed: (value: number) => void;
  selectionErrors: {
    difficulty?: string;
    category?: string;
  };
};

const SettingsContext = createContext<SettingsContextValue | undefined>(undefined);
const SETTINGS_STORAGE_KEY = 'quizbowl:settings';
const DEFAULT_REVEAL_SPEED = 0.5;

type PersistedSettings = {
  difficulties?: number[];
  categories?: string[];
  revealSpeed?: number;
};

function clampRevealSpeed(value: number): number {
  return Math.min(1, Math.max(0, value));
}

function isPersistedSettings(value: unknown): value is PersistedSettings {
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

function parsePersistedSettings(stored: string): PersistedSettings {
  const parsed = JSON.parse(stored) as unknown;
  return isPersistedSettings(parsed) ? parsed : {};
}

export function SettingsProvider({ children }: PropsWithChildren) {
  const [availableDifficulties, setAvailableDifficulties] = useState<DifficultyOption[]>(
    () => getAvailableDifficulties()
  );
  const [availableCategories, setAvailableCategories] = useState<CategoryOption[]>(
    () => getAvailableCategories()
  );
  const [selectedDifficulties, setSelectedDifficulties] = useState<number[]>(
    () => getAvailableDifficulties().flatMap((option) => option.values)
  );
  const [selectedCategories, setSelectedCategories] = useState<string[]>(
    () => getAvailableCategories().map((option) => option.name)
  );
  const [revealSpeed, setRevealSpeedState] = useState(0.5);
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

  const persistedSelectionsRef = useRef<PersistedSettings>({});
  const [storageReady, setStorageReady] = useState(false);
  const [defaultsReady, setDefaultsReady] = useState(false);

  useEffect(() => {
    const loadStoredSelections = async () => {
      try {
        const stored = await AsyncStorage.getItem(SETTINGS_STORAGE_KEY);
        if (stored) {
          persistedSelectionsRef.current = parsePersistedSettings(stored);
        }
      } catch (error) {
        console.error('Failed to load stored settings', error);
      } finally {
        setStorageReady(true);
      }
    };

    void loadStoredSelections();
  }, []);

  const applyDefaults = useCallback(
    (
      difficulties: DifficultyOption[],
      categories: CategoryOption[],
      persisted?: { difficulties?: number[]; categories?: string[]; revealSpeed?: number }
    ) => {
      const flattenedDifficulties = difficulties.flatMap((option) => option.values);
      const allDifficulties = () => flattenedDifficulties;
      const allCategories = () => categories.map((option) => option.name);

      setSelectedDifficulties((prev) => {
        const persistedValues = persisted?.difficulties?.filter((value) =>
          flattenedDifficulties.includes(value)
        );
        if (persistedValues && persistedValues.length > 0) {
          return persistedValues;
        }

        if (prev.length === 0) {
          return allDifficulties();
        }

        const filtered = prev.filter((value) => flattenedDifficulties.includes(value));
        return filtered.length > 0 ? filtered : allDifficulties();
      });
      clearSelectionError('difficulty');

      setSelectedCategories((prev) => {
        const persistedValues = persisted?.categories?.filter((name) =>
          categories.some((option) => option.name === name)
        );
        if (persistedValues && persistedValues.length > 0) {
          return persistedValues;
        }

        if (prev.length === 0) {
          return allCategories();
        }

        const filtered = prev.filter((name) =>
          categories.some((option) => option.name === name)
        );
        return filtered.length > 0 ? filtered : allCategories();
      });
      clearSelectionError('category');

      const persistedSpeed = persisted?.revealSpeed;
      const nextSpeed =
        typeof persistedSpeed === 'number' && Number.isFinite(persistedSpeed)
          ? clampRevealSpeed(persistedSpeed)
          : DEFAULT_REVEAL_SPEED;
      setRevealSpeedState(nextSpeed);
      setDefaultsReady(true);
    },
    [clearSelectionError]
  );

  const loadOptions = useCallback(async () => {
    setLoadingOptions(true);
    setLoadError(undefined);
    setDefaultsReady(false);

    try {
      const { difficulties, categories } = await fetchFilterOptions();
      setAvailableDifficulties(difficulties);
      setAvailableCategories(categories);
      applyDefaults(difficulties, categories, persistedSelectionsRef.current);
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
    if (!storageReady) {
      return;
    }
    void loadOptions();
  }, [loadOptions, storageReady]);

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!storageReady || !defaultsReady) {
      return;
    }
    persistedSelectionsRef.current = {
      difficulties: selectedDifficulties,
      categories: selectedCategories,
      revealSpeed,
    };

    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
    }
    persistTimerRef.current = setTimeout(() => {
      const payload = JSON.stringify(persistedSelectionsRef.current);
      AsyncStorage.setItem(SETTINGS_STORAGE_KEY, payload).catch((error) =>
        console.error('Failed to persist settings', error)
      );
    }, 500);

    return () => {
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
    };
  }, [defaultsReady, revealSpeed, selectedCategories, selectedDifficulties, storageReady]);

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

  const setRevealSpeed = useCallback((value: number) => {
    setRevealSpeedState(clampRevealSpeed(value));
  }, []);

  const value = useMemo<SettingsContextValue>(
    () => ({
      availableDifficulties,
      availableCategories,
      selectedDifficulties,
      selectedCategories,
      revealSpeed,
      loadingOptions,
      loadError,
      refreshOptions: loadOptions,
      toggleDifficulty,
      toggleCategory,
      selectAllDifficulties,
      selectAllCategories,
      setRevealSpeed,
      selectionErrors,
    }),
    [
      availableCategories,
      availableDifficulties,
      loadError,
      loadingOptions,
      loadOptions,
      revealSpeed,
      selectAllCategories,
      selectAllDifficulties,
      selectedCategories,
      selectedDifficulties,
      selectionErrors,
      toggleCategory,
      toggleDifficulty,
      setRevealSpeed,
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
