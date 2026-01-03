import { useSettingsContext } from '@/context/SettingsContext';

/**
 * Convenience hook to access persisted quiz settings and option metadata.
 */
export function useSettings() {
  return useSettingsContext();
}
