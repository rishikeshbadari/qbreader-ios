const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REVEAL_SPEED,
  clampRevealSpeed,
  isPersistedSettings,
  parsePersistedSettings,
  replaceDifficultySelection,
  resolveCategorySelection,
  resolveDifficultySelection,
  resolveRevealSpeed,
  toggleCategorySelection,
  toggleDifficultySelection,
} = require('../.test-build/utils/settings.js');

const {
  DIFFICULTY_PRESETS,
  areDifficultySelectionsEqual,
  getDifficultySelectionLabel,
  normalizeDifficultyValues,
} = require('../.test-build/utils/difficulty.js');

test('persisted settings parser accepts only the known settings shape', () => {
  assert.deepEqual(parsePersistedSettings('{"difficulties":[1,3],"categories":["History"],"revealSpeed":0.75}'), {
    difficulties: [1, 3],
    categories: ['History'],
    revealSpeed: 0.75,
  });
  assert.deepEqual(parsePersistedSettings('{"difficulties":["bad"],"categories":["History"]}'), {});
  assert.deepEqual(parsePersistedSettings('null'), {});

  assert.equal(isPersistedSettings({ revealSpeed: Number.POSITIVE_INFINITY }), false);
  assert.equal(isPersistedSettings({ categories: ['Science'] }), true);
});

test('reveal speed clamps persisted and user-provided values', () => {
  assert.equal(clampRevealSpeed(-1), 0);
  assert.equal(clampRevealSpeed(0.4), 0.4);
  assert.equal(clampRevealSpeed(2), 1);

  assert.equal(resolveRevealSpeed(-0.5), 0);
  assert.equal(resolveRevealSpeed(2), 1);
  assert.equal(resolveRevealSpeed(undefined), DEFAULT_REVEAL_SPEED);
  assert.equal(resolveRevealSpeed(Number.NaN), DEFAULT_REVEAL_SPEED);
});

test('default selection resolution prefers valid persisted values, then previous values, then all options', () => {
  assert.deepEqual(resolveDifficultySelection([1, 2, 3], [3], [2, 99]), [2]);
  assert.deepEqual(resolveDifficultySelection([1, 2, 3], [3, 99], [99]), [3]);
  assert.deepEqual(resolveDifficultySelection([1, 2, 3], [], [99]), [1, 2, 3]);
  assert.deepEqual(resolveDifficultySelection([1, 2, 3], [99], undefined), [1, 2, 3]);

  assert.deepEqual(resolveCategorySelection(['History', 'Science'], ['Science'], ['Bad', 'History']), ['History']);
  assert.deepEqual(resolveCategorySelection(['History', 'Science'], ['Science', 'Bad'], ['Bad']), ['Science']);
  assert.deepEqual(resolveCategorySelection(['History', 'Science'], [], undefined), ['History', 'Science']);
});

test('difficulty toggle cannot clear the final selected level and supports granular levels', () => {
  assert.deepEqual(toggleDifficultySelection([1, 2, 3], [2, 3]), {
    selection: [1],
  });
  assert.deepEqual(toggleDifficultySelection([1], [1]), {
    selection: [1],
    error: 'Select at least one difficulty.',
  });
  assert.deepEqual(toggleDifficultySelection([3], [1, 2]), {
    selection: [1, 2, 3],
  });
  assert.deepEqual(toggleDifficultySelection([1, 2, 3], [2]), {
    selection: [1, 3],
  });
  assert.deepEqual(toggleDifficultySelection([3], [7]), {
    selection: [3, 7],
  });
});

test('difficulty replacement normalizes preset and level selections', () => {
  assert.deepEqual(replaceDifficultySelection([1, 2, 3, 4], [4, 2, 4], [1]), {
    selection: [2, 4],
  });
  assert.deepEqual(replaceDifficultySelection([1, 2, 3], [99], [2]), {
    selection: [2],
    error: 'Select at least one difficulty.',
  });
  assert.deepEqual(replaceDifficultySelection([1, 2, 3], [], []), {
    selection: [1, 2, 3],
    error: 'Select at least one difficulty.',
  });
});

test('difficulty labels describe granular selections', () => {
  assert.deepEqual(normalizeDifficultyValues([3, 2, 2, 11, 1]), [1, 2, 3]);
  assert.equal(areDifficultySelectionsEqual([1, 2, 2, 3], [3, 1, 2]), true);
  assert.deepEqual(DIFFICULTY_PRESETS.map((preset) => preset.shortLabel), [
    'Middle School',
    'High School',
    'College',
  ]);
  assert.equal(getDifficultySelectionLabel([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]), 'All levels');
  assert.equal(getDifficultySelectionLabel([4]), 'Level 4');
  assert.equal(getDifficultySelectionLabel([2, 3, 4, 5]), 'High School');
  assert.equal(getDifficultySelectionLabel([3, 4, 5]), 'Levels 3-5');
  assert.equal(getDifficultySelectionLabel([1, 3, 7]), 'Levels 1, 3, 7');
});

test('category toggle cannot clear the final category and sorts additions', () => {
  assert.deepEqual(toggleCategorySelection(['History', 'Science'], 'History'), {
    selection: ['Science'],
  });
  assert.deepEqual(toggleCategorySelection(['History'], 'History'), {
    selection: ['History'],
    error: 'Select at least one category.',
  });
  assert.deepEqual(toggleCategorySelection(['Science'], 'History'), {
    selection: ['History', 'Science'],
  });
});
