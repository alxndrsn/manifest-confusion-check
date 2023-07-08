const { execSync } = require('node:child_process');
const fs = require('node:fs');

const { assert } = require('chai');

describe('Calling this on itself', () => {
  it('should generate expected report', () => {
    // given
    const expected = JSON.parse(fs.readFileSync('./test/expected-report.json'));
    // when
    const actual = JSON.parse(execSync('node ./src/index.js'));

    // then
    assert.deepEqual(actual, expected);
  });
});
