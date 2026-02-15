import { useCallback, useEffect, useRef, useState } from 'react';

import {
  createTransport,
  type DiscoveredSession,
  type MultiplayerTransport,
} from '@/services/multiplayer/transport';

const REMOVAL_DELAY_MS = 2000;

/**
 * Discovers nearby multiplayer game sessions via MultipeerConnectivity browsing.
 *
 * Creates its own transport instance dedicated to browsing. The transport is
 * torn down when the component unmounts.
 *
 * When the advertiser restarts (e.g. player list updated), browsers briefly see
 * lostPeer then foundPeer. This hook handles that by delaying removal by 2s and
 * cancelling removal if the session reappears within that window.
 */
export function useNearbyGames() {
  const [sessions, setSessions] = useState<DiscoveredSession[]>([]);
  const [isSearching, setIsSearching] = useState(false);
  const transportRef = useRef<MultiplayerTransport | null>(null);
  const removalTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());

  const startSearching = useCallback(async () => {
    if (transportRef.current) return;

    const transport = createTransport();
    transportRef.current = transport;
    setSessions([]);
    setIsSearching(true);

    await transport.startBrowsing({
      onSessionFound: (session) => {
        // Cancel any pending removal for this session
        const timer = removalTimers.current.get(session.sessionId);
        if (timer) {
          clearTimeout(timer);
          removalTimers.current.delete(session.sessionId);
        }

        setSessions((prev) => {
          const idx = prev.findIndex((s) => s.sessionId === session.sessionId);
          if (idx >= 0) {
            // Update existing session's player list
            const next = [...prev];
            next[idx] = session;
            return next;
          }
          return [...prev, session];
        });
      },
      onSessionLost: (sessionId) => {
        // Delay removal to handle advertiser restarts
        const timer = setTimeout(() => {
          removalTimers.current.delete(sessionId);
          setSessions((prev) => prev.filter((s) => s.sessionId !== sessionId));
        }, REMOVAL_DELAY_MS);
        removalTimers.current.set(sessionId, timer);
      },
    });
  }, []);

  useEffect(() => {
    void startSearching();
    return () => {
      // Clean up browsing transport and timers
      if (transportRef.current) {
        void transportRef.current.stopBrowsing();
        transportRef.current = null;
      }
      for (const timer of removalTimers.current.values()) {
        clearTimeout(timer);
      }
      removalTimers.current.clear();
    };
  }, [startSearching]);

  return { sessions, isSearching };
}
