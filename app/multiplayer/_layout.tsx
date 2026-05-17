import { Stack, useRouter } from 'expo-router';
import { useEffect, useRef } from 'react';

import { useMultiplayer } from '@/context/MultiplayerContext';

const FORCED_EXIT_RESET_DELAY_MS = 450;

export default function MultiplayerLayout() {
  const router = useRouter();
  const { forcedExitReason, acknowledgeForcedExit, completeForcedExit } = useMultiplayer();
  const handledForcedExitRef = useRef(false);

  useEffect(() => {
    if (!forcedExitReason || handledForcedExitRef.current) return;

    handledForcedExitRef.current = true;
    router.dismissTo('/(tabs)/multiplayer');
    acknowledgeForcedExit();
  }, [acknowledgeForcedExit, forcedExitReason, router]);

  useEffect(() => (
    () => {
      if (!handledForcedExitRef.current) return;

      setTimeout(completeForcedExit, FORCED_EXIT_RESET_DELAY_MS);
    }
  ), [completeForcedExit]);

  return (
    <Stack
      screenOptions={{
        headerShown: false,
      }}
    />
  );
}
