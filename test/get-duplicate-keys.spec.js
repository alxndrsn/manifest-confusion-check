const { assert } = require('chai');

const getDuplicateKeys = require('../src/get-duplicate-keys');

describe('getDuplicateKeys()', () => {
  [
    {
      input: '{ "a":1 }',
      expected: [],
    },
    {
      input: '{ "a":1, "a":2 }',
      expected: [ 'a' ],
    },
    {
      input: '{ "a":1, "a":2, "a":3 }',
      expected: [ 'a' ],
    },
    {
      input: '{ "a":1, "a":2, "a":3, "a":4 }',
      expected: [ 'a' ],
    },
    {
      input: '{ "b":{ "a":1 } }',
      expected: [],
    },
    {
      input: '{ "b":{ "a":1, "a":2 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "b":{ "a":1, "a":2, "a":3 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "b":{ "a":1, "a":2, "a":3, "a":4 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":{ "a":1 } }',
      expected: [],
    },
    {
      input: '{ "c":0, "b":{ "a":1, "a":2 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":{ "a":1, "a":2, "a":3 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":{ "a":1, "a":2, "a":3, "a":4 } }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":[ { "a":1 } ] }',
      expected: [],
    },
    {
      input: '{ "c":0, "b":[ { "a":1, "a":2 } ] }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":[ { "a":1, "a":2, "a":3 } ] }',
      expected: [ 'b.a' ],
    },
    {
      input: '{ "c":0, "b":[ { "a":1, "a":2, "a":3, "a":4 } ] }',
      expected: [ 'b.a' ],
    },
  ].forEach(({ input, expected }, idx) => {
    it(`should correctly detect dupes in example #${idx} (${input})`, async function() {
      // when
      const dupes = await getDuplicateKeys(input);

      // then
      assert.deepEqual(dupes, expected);
    });
  });

  [
    {
      input: 'i am not json',
      expected: 'Non-whitespace before {[.\nLine: 1\nColumn: 1\nChar: 105',
    },
    {
      input: '{}x',
      expected: 'Bad value\nLine: 1\nColumn: 3\nChar: 120',
    },
  ].forEach(({ input, expected }, idx) => {
    it(`should throw error for example #${idx} (${input})`, async function() {
      try {
        // when
        await getDuplicateKeys(input);
        assert.fail('Should have thrown an Error.');
      } catch(err) {
        // then
        assert.equal(err.message, expected);
      }
    });
  });
});
