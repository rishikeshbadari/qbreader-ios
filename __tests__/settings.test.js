const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_REVEAL_SPEED,
  clampRevealSpeed,
  isPersistedSettings,
  parsePersistedSettings,
  resolveCategorySelection,
  resolveDifficultySelection,
  resolveRevealSpeed,
  toggleCategorySelection,
  toggleDifficultySelection,
} = require('../.test-build/utils/settings.js');

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

test('difficulty toggle cannot clear the final selected difficulty group', () => {
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
