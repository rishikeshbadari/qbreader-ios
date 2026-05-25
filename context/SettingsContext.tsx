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
import {
  clampRevealSpeed,
  parsePersistedSettings,
  resolveCategorySelection,
  resolveDifficultySelection,
  resolveRevealSpeed,
  replaceDifficultySelection,
  toggleCategorySelection,
  toggleDifficultySelection,
  type PersistedSettings,
} from '@/utils/settings';

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
  setDifficulties: (values: number[]) => void;
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
      const categoryNames = categories.map((option) => option.name);

      setSelectedDifficulties((prev) => {
        return resolveDifficultySelection(flattenedDifficulties, prev, persisted?.difficulties);
      });
      clearSelectionError('difficulty');

      setSelectedCategories((prev) => {
        return resolveCategorySelection(categoryNames, prev, persisted?.categories);
      });
      clearSelectionError('category');

      setRevealSpeedState(resolveRevealSpeed(persisted?.revealSpeed));
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
      setSelectedDifficulties((prev) => {
        const update = toggleDifficultySelection(prev, values);
        if (update.error) {
          setSelectionError('difficulty', update.error);
        } else {
          clearSelectionError('difficulty');
        }
        return update.selection;
      });
    },
    [clearSelectionError, setSelectionError]
  );

  const setDifficulties = useCallback(
    (values: number[]) => {
      setSelectedDifficulties((prev) => {
        const availableValues = availableDifficulties.flatMap((option) => option.values);
        const update = replaceDifficultySelection(availableValues, values, prev);
        if (update.error) {
          setSelectionError('difficulty', update.error);
        } else {
          clearSelectionError('difficulty');
        }
        return update.selection;
      });
    },
    [availableDifficulties, clearSelectionError, setSelectionError]
  );

  const toggleCategory = useCallback(
    (name: string) => {
      setSelectedCategories((prev) => {
        const update = toggleCategorySelection(prev, name);
        if (update.error) {
          setSelectionError('category', update.error);
        } else {
          clearSelectionError('category');
        }
        return update.selection;
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
      setDifficulties,
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
      setDifficulties,
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
