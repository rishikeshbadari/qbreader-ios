type StartupWarmupListener = () => void;

let isTabWarmupComplete = false;
const tabWarmupListeners = new Set<StartupWarmupListener>();

export function isStartupTabWarmupComplete() {
  return isTabWarmupComplete;
}

export function markStartupTabWarmupComplete() {
  if (isTabWarmupComplete) {
    return;
  }

  isTabWarmupComplete = true;
  tabWarmupListeners.forEach((listener) => listener());
}

export function subscribeToStartupTabWarmup(listener: StartupWarmupListener) {
  tabWarmupListeners.add(listener);

  if (isTabWarmupComplete) {
    listener();
  }

  return () => {
    tabWarmupListeners.delete(listener);
  };
}
