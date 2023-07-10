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

    function log(...args) {
      console.log('[LOG]', ...args, JSON.stringify(keystack));
    }

    function processKey(key) {
      log('processKey()', key, '->', [ ...keystack.slice(1).map(e => e.key), key ].join('.'));
      lastKey = key;
      const status = peek.props[key];
      log(key, status);
      if(!status) {
        peek.props[key] = SEEN_ONCE;
      } else if(status === SEEN_ONCE) {
        duplicateKeys.push([ ...keystack.slice(1).map(e => e.key), key ].join('.'));
        peek.props[key] = SEEN_MULTIPLE;
      }
    }

    parser.onerror = e => { reject(e); };
    parser.onvalue = (...args) => { /* don't care */ log('onvalue', args) };
    parser.onopenobject = (key, ...args) => {
      if(args.length) throw new Error(`What are these extra args for onopenobject? ${args}`);
      log('onopenobject');
      keystack.push(peek = { key:lastKey, props:{} });
      processKey(key);
    };
    parser.onkey = key => {
      processKey(key);
    };
    parser.oncloseobject = (...args) => { log('oncloseobject', args); keystack.pop(); peek = keystack[keystack.length-1]; }; // TODO this will need some attention with more complex examples!
    parser.onopenarray = (...args) => { /* don't care */ log('onopenarray', args); };
    parser.onclosearray = () => { /* don't care */ };
    parser.onend = () => resolve(duplicateKeys);

    parser.write(rawJson).close();
  });
}
