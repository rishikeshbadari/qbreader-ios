const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildRandomTossupUrl,
  getAvailableCategories,
  getAvailableDifficulties,
  normalizeTossup,
} = require('../.test-build/services/qbreader.js');

test('QBReader URL builder clamps count and applies filters', () => {
  const url = new URL(buildRandomTossupUrl(99, {
    difficulties: [3, 1],
    categories: ['History', 'Science'],
  }));

  assert.equal(url.origin + url.pathname, 'https://www.qbreader.org/api/random-tossup');
  assert.equal(url.searchParams.get('number'), '10');
  assert.equal(url.searchParams.get('difficulties'), '3,1');
  assert.equal(url.searchParams.get('categories'), 'History,Science');

  assert.equal(new URL(buildRandomTossupUrl(0)).searchParams.get('number'), '1');
  assert.equal(new URL(buildRandomTossupUrl(2.9)).searchParams.get('number'), '2');
  assert.equal(new URL(buildRandomTossupUrl(Number.NaN)).searchParams.get('number'), '1');
});

test('QBReader tossup normalizer prefers sanitized text and cleans bad suffixes', () => {
  const tossup = normalizeTossup({
    id: 123,
    question: '<p>Question <b>HTML</b></p>',
    question_sanitized: 'Question sanitized undefined',
    answer: '<b>Answer HTML</b>',
    answer_sanitized: 'Answer sanitized',
    category: { name: 'History' },
    subcategory: { name: 'European History' },
    difficulty: '3',
    set: { name: 'Set Name' },
    packet: { number: 4 },
    number: 7,
  });

  assert.deepEqual(tossup, {
    id: '123',
    questionHtml: '<p>Question <b>HTML</b></p>',
    answerHtml: '<b>Answer HTML</b>',
    question: 'Question sanitized',
    answer: 'Answer sanitized',
    category: 'History',
    subcategory: 'European History',
    difficulty: '3',
    setName: 'Set Name',
    packetNumber: 4,
    questionNumber: 7,
  });
});

test('QBReader tossup normalizer falls back to stripped HTML and string packet metadata', () => {
  const tossup = normalizeTossup({
    _id: 'mongo-id',
    question: 'This is <i>question</i>',
    answer: '<b>Answer</b> undefined',
    category: 'Science',
    subcategory: 'Physics',
    set: 'String Set',
    packet: '12',
  });

  assert.equal(tossup.id, 'mongo-id');
  assert.equal(tossup.question, 'This is question');
  assert.equal(tossup.answer, 'Answer');
  assert.equal(tossup.category, 'Science');
  assert.equal(tossup.subcategory, 'Physics');
  assert.equal(tossup.setName, 'String Set');
  assert.equal(tossup.packetNumber, 12);
});

test('filter option helpers expose sorted categories and difficulty groups', () => {
  assert.deepEqual(getAvailableDifficulties(), [
    { label: 'Middle School', values: [1] },
    { label: 'High School', values: [2, 3, 4, 5] },
    { label: 'College', values: [6, 7, 8, 9, 10] },
  ]);

  const categoryNames = getAvailableCategories().map((category) => category.name);
  assert.deepEqual(categoryNames, [...categoryNames].sort((a, b) => a.localeCompare(b)));
  assert.equal(categoryNames.includes('History'), true);
  assert.equal(categoryNames.includes('Science'), true);
});
