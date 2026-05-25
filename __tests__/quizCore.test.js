const test = require('node:test');
const assert = require('node:assert/strict');

const {
  directiveLabel,
  normalizeDirective,
} = require('../.test-build/utils/directives.js');
const {
  getQuestionWordCount,
  getRevealIntervalMs,
  getRevealStartTimeForWordIndex,
  getVisibleWordCountForTime,
} = require('../.test-build/utils/revealTiming.js');
const {
  buildQuestionFilters,
  buildQuestionFiltersKey,
  createSessionHistoryEntry,
  getUniqueUnseenTossups,
  prependHistoryEntry,
  resolvePromptDisplayText,
  resolvePromptResult,
} = require('../.test-build/utils/quizSession.js');
const {
  calculateSessionStats,
} = require('../.test-build/utils/sessionStats.js');
const {
  stripHtmlTags,
  truncateText,
} = require('../.test-build/utils/text.js');

function tossup(id) {
  return {
    id,
    question: `Question ${id}`,
    questionHtml: `<p>Question ${id}</p>`,
    answer: `Answer ${id}`,
    answerHtml: `<b>Answer ${id}</b>`,
  };
}

function historyEntry(id, directive) {
  return {
    id,
    tossup: tossup(id),
    userAnswer: 'answer',
    result: { directive },
    timestamp: Number(id.replace(/\D/g, '')) || 1,
  };
}

test('directives normalize to the app display buckets', () => {
  assert.equal(normalizeDirective({ directive: ' ACCEPT ' }), 'accept');
  assert.equal(normalizeDirective({ directive: 'prompt' }), 'prompt');
  assert.equal(normalizeDirective({ directive: 'skip' }), 'skip');
  assert.equal(normalizeDirective({ directive: 'anti-prompt' }), 'incorrect');
  assert.equal(normalizeDirective(null), 'incorrect');

  assert.equal(directiveLabel({ directive: 'accept' }), 'Correct');
  assert.equal(directiveLabel({ directive: 'reject' }), 'Incorrect');
});

test('text helpers strip simple HTML and truncate with an ellipsis', () => {
  assert.equal(stripHtmlTags('<p>Hello <b>world</b></p>'), 'Hello world');
  assert.equal(stripHtmlTags('A<br />B&nbsp;C'), 'A B&nbsp;C');
  assert.equal(stripHtmlTags(null), '');

  assert.equal(truncateText('short', 10), 'short');
  assert.equal(truncateText('long text value', 9), `long tex${String.fromCharCode(8230)}`);
});

test('reveal timing clamps speed and computes visible word counts', () => {
  assert.equal(getRevealIntervalMs(-1), 650);
  assert.equal(getRevealIntervalMs(0), 650);
  assert.equal(getRevealIntervalMs(0.5), 365);
  assert.equal(getRevealIntervalMs(1), 0);
  assert.equal(getRevealIntervalMs(2), 0);

  assert.equal(getQuestionWordCount('  one   two\nthree  '), 3);
  assert.equal(getVisibleWordCountForTime(1000, 100, 4, 999), 0);
  assert.equal(getVisibleWordCountForTime(1000, 100, 4, 1000), 1);
  assert.equal(getVisibleWordCountForTime(1000, 100, 4, 1249), 3);
  assert.equal(getVisibleWordCountForTime(1000, 0, 4, 1000), 4);
  assert.equal(getVisibleWordCountForTime(1000, 100, 4, 5000), 4);

  assert.equal(getRevealStartTimeForWordIndex(0, 100, 1000), 1100);
  assert.equal(getRevealStartTimeForWordIndex(3, 100, 1000), 800);
  assert.equal(getRevealStartTimeForWordIndex(3, 0, 1000), 1000);
});

test('question filters omit empty selections and produce stable sorted keys', () => {
  assert.deepEqual(buildQuestionFilters([], []), {
    difficulties: undefined,
    categories: undefined,
  });
  assert.deepEqual(buildQuestionFilters([3, 1], ['Science']), {
    difficulties: [3, 1],
    categories: ['Science'],
  });

  assert.equal(
    buildQuestionFiltersKey({ difficulties: [5, 2], categories: ['Science', 'History'] }),
    '2,5|History,Science',
  );
});

test('unique tossup helper filters already seen ids and records new ids', () => {
  const seen = new Set(['a']);
  const unique = getUniqueUnseenTossups([tossup('a'), tossup('b'), tossup('b'), tossup('c')], seen);

  assert.deepEqual(unique.map((question) => question.id), ['b', 'c']);
  assert.deepEqual(Array.from(seen).sort(), ['a', 'b', 'c']);
});

test('prompt resolution gives exactly one retry before converting prompt to reject', () => {
  assert.deepEqual(resolvePromptResult({ directive: 'prompt', directedPrompt: 'first name' }, false), {
    action: 'prompt',
    directedPrompt: 'first name',
  });
  assert.deepEqual(resolvePromptResult({ directive: 'prompt', directedPrompt: 'first name' }, true), {
    action: 'record',
    result: { directive: 'reject', directedPrompt: 'first name' },
  });
  assert.deepEqual(resolvePromptResult({ directive: 'accept' }, true), {
    action: 'record',
    result: { directive: 'accept' },
  });
});

test('prompt display text falls back when answer checker omits a directed prompt', () => {
  assert.equal(resolvePromptDisplayText(' first name '), 'first name');
  assert.equal(resolvePromptDisplayText(''), 'Be more specific');
  assert.equal(resolvePromptDisplayText(undefined), 'Be more specific');
});

test('history helpers prepend entries and enforce the configured cap', () => {
  const entry = createSessionHistoryEntry(tossup('q1'), 'Einstein', { directive: 'accept' }, 1234);
  assert.equal(entry.id, 'q1-1234');
  assert.equal(entry.userAnswer, 'Einstein');

  const skipped = createSessionHistoryEntry(tossup('q1'), '', { directive: 'skip' }, 1234, 'skip');
  assert.equal(skipped.id, 'q1-1234-skip');

  const capped = prependHistoryEntry([historyEntry('old-1', 'reject'), historyEntry('old-2', 'skip')], entry, 2);
  assert.deepEqual(capped.map((item) => item.id), ['q1-1234', 'old-1']);
});

test('session stats count directives and current correct streak', () => {
  const stats = calculateSessionStats([
    historyEntry('newest-1', 'accept'),
    historyEntry('newest-2', 'accept'),
    historyEntry('newest-3', 'prompt'),
    historyEntry('newest-4', 'reject'),
    historyEntry('newest-5', 'skip'),
    historyEntry('newest-6', 'anti-prompt'),
  ]);

  assert.deepEqual(stats, {
    total: 6,
    correct: 2,
    prompts: 1,
    incorrect: 2,
    skipped: 1,
    accuracy: 2 / 6,
    streak: 2,
  });

  assert.equal(calculateSessionStats([]).accuracy, 0);
});
