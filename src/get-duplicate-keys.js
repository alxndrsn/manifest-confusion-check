module.exports = getDuplicateKeys;

const SEEN_ONCE = 'seen-once';
const SEEN_MULTIPLE = 'seen-multiple';

function getDuplicateKeys(rawJson) {
  return new Promise((resolve, reject) => {
    const clarinet = require('clarinet');
    const parser = clarinet.parser();

    const duplicateKeys = [];
    const keystack = [];
    let peek;
    let lastKey;

    function processKey(key) {
      lastKey = key;
      const status = peek.props[key];
      if(!status) {
        peek.props[key] = SEEN_ONCE;
      } else if(status === SEEN_ONCE) {
        duplicateKeys.push([ ...keystack.slice(1).map(e => e.key), key ].join('.'));
        peek.props[key] = SEEN_MULTIPLE;
      }
    }

    parser.onerror = e => { reject(e); };
    parser.onkey = processKey;
    parser.onopenobject = (firstKey) => {
      keystack.push(peek = { key:lastKey, props:{} });
      processKey(firstKey); // onkey not fired for first key o_O
    };
    parser.oncloseobject = () => {
      keystack.pop(); peek = keystack[keystack.length-1];
    };
    parser.onend = () => resolve(duplicateKeys);

    parser.write(rawJson).close();
  });
}
