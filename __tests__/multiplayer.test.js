const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getCoordinatorPlayerId,
  getOnlinePlayers,
  isPlayerOnline,
} = require('../.test-build/utils/multiplayerPlayers.js');
const {
  canStartMultiplayerGame,
  getHostTransferCandidates,
  getReadyOnlinePlayerCount,
} = require('../.test-build/utils/multiplayerLobby.js');
const {
  reconcilePresencePlayers,
} = require('../.test-build/utils/multiplayerPresence.js');
const {
  buildAuthoritativePlayersUpdate,
  uniquePlayersById,
} = require('../.test-build/utils/multiplayerMembership.js');
const {
  buildActivePlayerRemovalUpdate,
} = require('../.test-build/utils/multiplayerRemoval.js');
const {
  buzzLabel,
  buzzPointDelta,
  computeMultiplayerScores,
} = require('../.test-build/utils/multiplayerSummary.js');
const {
  parseMatchHistory,
  prependMatchHistory,
} = require('../.test-build/utils/matchHistory.js');

function player(id, name = id, status = 'active') {
  return { id, name, status };
}

function ids(players) {
  return players.map((p) => p.id);
}

function summary(players, hostId = players[0].id) {
  return {
    sessionId: 'ROOM01',
    players,
    hostId,
    settings: { difficulties: [1, 2, 3], categories: ['History'], revealSpeed: 1 },
    questions: [],
  };
}

function questionRecord(buzzes) {
  return {
    question: {
      id: 'q',
      question: 'Question',
      questionHtml: 'Question',
      answer: 'Answer',
      answerHtml: 'Answer',
    },
    buzzes,
  };
}

test('online player helpers treat disconnected and left players as offline', () => {
  const alice = player('alice');
  const bob = player('bob');
  const charlie = player('charlie', 'Charlie', 'left');
  const dana = player('dana');

  assert.equal(isPlayerOnline(alice, {}), true);
  assert.equal(isPlayerOnline(bob, { bob: 'disconnected' }), false);
  assert.equal(isPlayerOnline(dana, { dana: 'reconnecting' }), false);
  assert.equal(isPlayerOnline(charlie, {}), false);

  assert.deepEqual(
    ids(getOnlinePlayers([alice, bob, charlie, dana], { bob: 'disconnected', dana: 'reconnecting' })),
    ['alice'],
  );
});

test('coordinator ignores a disconnected lexicographically-first player', () => {
  const players = [player('alice'), player('bob'), player('charlie')];

  assert.equal(getCoordinatorPlayerId(players, {}), 'alice');
  assert.equal(getCoordinatorPlayerId(players, { alice: 'disconnected' }), 'bob');
  assert.equal(getCoordinatorPlayerId(players, { alice: 'reconnecting', bob: 'connected' }), 'bob');
});

test('coordinator falls back to active players only while every status is offline', () => {
  const players = [player('alice'), player('bob')];

  assert.equal(
    getCoordinatorPlayerId(players, { alice: 'disconnected', bob: 'disconnected' }),
    'alice',
  );
  assert.equal(getCoordinatorPlayerId([player('alice', 'Alice', 'left')], {}), null);
});

test('lobby start eligibility counts only ready online players', () => {
  const players = [player('host'), player('peer'), player('ghost')];
  const readyPlayers = ['host', 'peer', 'ghost'];
  const connectionStatuses = { host: 'connected', peer: 'connected', ghost: 'disconnected' };

  assert.equal(getReadyOnlinePlayerCount(players, readyPlayers, connectionStatuses), 2);
  assert.equal(canStartMultiplayerGame(true, players, readyPlayers, connectionStatuses), true);
  assert.equal(canStartMultiplayerGame(false, players, readyPlayers, connectionStatuses), false);

  assert.equal(
    canStartMultiplayerGame(true, players, readyPlayers, { host: 'connected', peer: 'disconnected', ghost: 'disconnected' }),
    false,
  );
});

test('host transfer candidates exclude self, left players, and offline players', () => {
  const host = player('host');
  const peer = player('peer');
  const late = player('late');
  const stale = player('stale');
  const left = player('left', 'Left', 'left');
  const allPlayers = [host, stale, peer, left];
  const activePlayers = [host, peer, late, stale, left];

  assert.deepEqual(
    ids(getHostTransferCandidates(activePlayers, allPlayers, 'host', {
      stale: 'disconnected',
      late: 'connected',
      peer: 'connected',
    })),
    ['peer', 'late'],
  );
});

test('presence reconciliation emits joins from full sync state', () => {
  const previous = new Map([['host', 'Host']]);
  const presenceState = {
    hostPresence: [{ playerId: 'host', playerName: 'Host' }],
    peerPresence: [{ playerId: 'peer', playerName: 'Peer' }],
  };

  const reconciliation = reconcilePresencePlayers(previous, presenceState, 'host');

  assert.deepEqual(reconciliation.joinedPlayers, [{ id: 'peer', name: 'Peer' }]);
  assert.deepEqual(reconciliation.leftPlayerIds, []);
  assert.deepEqual(Array.from(reconciliation.currentPresencePlayers), [
    ['host', 'Host'],
    ['peer', 'Peer'],
  ]);
});

test('presence reconciliation emits leaves from full sync state but ignores self', () => {
  const previous = new Map([
    ['host', 'Host'],
    ['peer', 'Peer'],
    ['stale', 'Stale'],
  ]);
  const presenceState = {
    hostPresence: [{ playerId: 'host', playerName: 'Host' }],
    peerPresence: [{ playerId: 'peer', playerName: 'Peer' }],
  };

  const reconciliation = reconcilePresencePlayers(previous, presenceState, 'host');

  assert.deepEqual(reconciliation.joinedPlayers, []);
  assert.deepEqual(reconciliation.leftPlayerIds, ['stale']);
});

test('unique player merge preserves first-seen order while refreshing player data', () => {
  assert.deepEqual(
    uniquePlayersById([
      player('host', 'Old Host'),
      player('peer', 'Peer'),
      player('host', 'New Host'),
    ]),
    [
      player('host', 'New Host'),
      player('peer', 'Peer'),
    ],
  );
});

test('authoritative player sync removes stale old host when that user rejoins with a new id', () => {
  const oldHost = player('host-old', 'Rohan');
  const peer = player('peer', 'Alice');
  const other = player('other', 'Bob');
  const rejoinedHost = player('host-new', 'Rohan');

  const update = buildAuthoritativePlayersUpdate(
    [peer, other, rejoinedHost],
    {
      players: [oldHost, peer, other, rejoinedHost],
      allPlayers: [oldHost, peer, other, rejoinedHost],
      readyPlayers: ['host-old', 'peer', 'other', 'host-new'],
      lockedOutPlayers: ['host-old', 'peer'],
      connectionStatuses: {
        'host-old': 'connected',
        peer: 'connected',
        other: 'connected',
        'host-new': 'connected',
      },
      hostId: 'peer',
      summary: summary([oldHost, peer, other, rejoinedHost], 'peer'),
      currentBuzzerId: 'host-old',
    },
    'peer',
    1234,
  );

  assert.deepEqual(ids(update.players), ['peer', 'other', 'host-new']);
  assert.equal(update.hostId, 'peer');
  assert.deepEqual(update.removedPlayerIds, ['host-old']);
  assert.equal(update.connectionStatuses['host-old'], 'disconnected');
  assert.equal(update.allPlayers.find((p) => p.id === 'host-old').status, 'left');
  assert.equal(update.summary.players.find((p) => p.id === 'host-old').status, 'left');
  assert.deepEqual(update.readyPlayers, ['peer', 'other', 'host-new']);
  assert.deepEqual(update.lockedOutPlayers, ['peer']);
  assert.equal(update.wasActiveBuzzer, true);
});

test('authoritative player sync transfers host when current host is no longer present', () => {
  const host = player('host', 'Host');
  const peer = player('peer', 'Peer');

  const update = buildAuthoritativePlayersUpdate(
    [peer],
    {
      players: [host, peer],
      allPlayers: [host, peer],
      readyPlayers: ['host', 'peer'],
      lockedOutPlayers: [],
      connectionStatuses: { host: 'connected', peer: 'connected' },
      hostId: 'host',
      summary: summary([host, peer], 'host'),
    },
    'host',
    1234,
  );

  assert.deepEqual(ids(update.players), ['peer']);
  assert.equal(update.hostId, 'peer');
  assert.equal(update.summary.hostId, 'peer');
  assert.equal(update.summary.players.find((p) => p.id === 'host').status, 'left');
});

test('active player removal kicks a player out of active state and ready/lock lists', () => {
  const host = player('host');
  const peer = player('peer');
  const update = buildActivePlayerRemovalUpdate('peer', {
    players: [host, peer],
    allPlayers: [host, peer],
    readyPlayers: ['host', 'peer'],
    lockedOutPlayers: ['peer'],
    hostId: 'host',
    summary: summary([host, peer], 'host'),
  }, 1234);

  assert.deepEqual(ids(update.players), ['host']);
  assert.deepEqual(update.readyPlayers, ['host']);
  assert.deepEqual(update.lockedOutPlayers, []);
  assert.equal(update.hostId, 'host');
  assert.equal(update.shouldEndGame, false);
  assert.equal(update.summary.players.find((p) => p.id === 'peer').status, 'left');
  assert.equal(update.summary.endedAt, undefined);
});

test('active player removal transfers host when the host leaves', () => {
  const host = player('host');
  const peer = player('peer');
  const update = buildActivePlayerRemovalUpdate('host', {
    players: [host, peer],
    allPlayers: [host, peer],
    readyPlayers: ['host', 'peer'],
    lockedOutPlayers: [],
    hostId: 'host',
    summary: summary([host, peer], 'host'),
  }, 1234);

  assert.deepEqual(ids(update.players), ['peer']);
  assert.equal(update.hostId, 'peer');
  assert.equal(update.summary.hostId, 'peer');
});

test('active player removal ends the game when the last player leaves', () => {
  const host = player('host');
  const update = buildActivePlayerRemovalUpdate('host', {
    players: [host],
    allPlayers: [host],
    readyPlayers: ['host'],
    lockedOutPlayers: [],
    hostId: 'host',
    summary: summary([host], 'host'),
  }, 9876);

  assert.deepEqual(update.players, []);
  assert.equal(update.hostId, null);
  assert.equal(update.shouldEndGame, true);
  assert.equal(update.summary.hostId, 'host');
  assert.equal(update.summary.endedAt, 9876);
});

test('active player removal reports active buzzer cleanup requirement', () => {
  const host = player('host');
  const peer = player('peer');

  assert.equal(
    buildActivePlayerRemovalUpdate('peer', {
      players: [host, peer],
      allPlayers: [host, peer],
      readyPlayers: [],
      lockedOutPlayers: [],
      hostId: 'host',
      summary: summary([host, peer], 'host'),
      currentBuzzerId: 'peer',
    }).wasActiveBuzzer,
    true,
  );

  assert.equal(
    buildActivePlayerRemovalUpdate('peer', {
      players: [host, peer],
      allPlayers: [host, peer],
      readyPlayers: [],
      lockedOutPlayers: [],
      hostId: 'host',
      summary: summary([host, peer], 'host'),
      activeBuzzerId: 'peer',
    }).wasActiveBuzzer,
    true,
  );
});

test('multiplayer scoring counts correct, powers, wrong answers, and left players', () => {
  const host = player('host', 'Host');
  const peer = player('peer', 'Peer', 'left');
  const gameSummary = {
    ...summary([host, peer], 'host'),
    questions: [
      questionRecord([
        { playerId: 'peer', timestamp: 1, answer: 'power', result: { directive: 'accept' }, isPower: true },
        { playerId: 'host', timestamp: 2, answer: 'wrong', result: { directive: 'reject' } },
      ]),
      questionRecord([
        { playerId: 'host', timestamp: 3, answer: '', result: { directive: 'skip' } },
      ]),
    ],
  };

  assert.deepEqual(computeMultiplayerScores(gameSummary), [
    {
      id: 'peer',
      name: 'Peer',
      status: 'left',
      correct: 1,
      incorrect: 0,
      powers: 1,
      points: 15,
      accuracy: 1,
    },
    {
      id: 'host',
      name: 'Host',
      status: 'active',
      correct: 0,
      incorrect: 1,
      powers: 0,
      points: 0,
      accuracy: 0,
    },
  ]);
});

test('multiplayer buzz display helpers derive point deltas and labels', () => {
  assert.equal(buzzPointDelta({ result: { directive: 'accept' } }), 10);
  assert.equal(buzzPointDelta({ result: { directive: 'accept' }, isPower: true }), 15);
  assert.equal(buzzPointDelta({ result: { directive: 'reject' } }), 0);
  assert.equal(buzzPointDelta({ result: { directive: 'prompt' } }), 0);

  assert.equal(buzzLabel({ isPower: true, timedOut: true }), 'POWER');
  assert.equal(buzzLabel({ timedOut: true }), 'TIMEOUT');
  assert.equal(buzzLabel({}), null);
});

test('match history parser filters malformed entries and prepends with a cap', () => {
  const valid = summary([player('host')], 'host');
  const parsed = parseMatchHistory(JSON.stringify([
    valid,
    { sessionId: 'bad', players: [] },
    null,
    { sessionId: 'bad-2', players: [], questions: [] },
  ]));

  assert.deepEqual(parsed.map((item) => item.sessionId), ['ROOM01', 'bad-2']);

  const existing = Array.from({ length: 3 }, (_, index) => ({
    ...summary([player(`p${index}`)], `p${index}`),
    sessionId: `old-${index}`,
  }));
  const updated = prependMatchHistory(existing, { ...valid, sessionId: 'new' }, 3);
  assert.deepEqual(updated.map((item) => item.sessionId), ['new', 'old-0', 'old-1']);
});
