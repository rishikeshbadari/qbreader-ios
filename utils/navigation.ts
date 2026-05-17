import { CommonActions, type NavigationContainerRef } from '@react-navigation/native';

export function resetToMultiplayerHome(
  rootNavigation: NavigationContainerRef<ReactNavigation.RootParamList> | null,
  fallback?: () => void,
) {
  if (!rootNavigation?.isReady()) {
    fallback?.();
    return;
  }

  rootNavigation.dispatch(
    CommonActions.reset({
      index: 0,
      routes: [
        {
          name: '(tabs)',
          state: {
            index: 3,
            routes: [
              { name: 'index' },
              { name: 'history' },
              { name: 'settings' },
              { name: 'multiplayer' },
            ],
          },
        },
      ],
    }),
  );
}
