module.exports = getDuplicateKeys;

function getDuplicateKeys(rawJson) {
  return new Promise((resolve, reject) => {
    const clarinet = require('clarinet');
    const parser = clarinet.parser();

    const duplicateKeys = [];
    const keystack = [];
    let peek;
    let lastKey;

    function processKey(key) {
      console.log('processKey()', key, '->', [ ...keystack.slice(1).map(e => e.key), key ].join('.'));
      lastKey = key;
      const status = peek.props[key];
      console.log(key, status);
      if(!status) {
        peek.props[key] = 1;
      } else if(status === 1) {
        duplicateKeys.push([ ...keystack.slice(1).map(e => e.key), key ].join('.'));
        peek.props[key] = 2;
      }
    }

    parser.onerror = e => { reject(e); };
    parser.onvalue = () => { /* don't care */ }
    parser.onopenobject = key => {
      console.log('onopenobject', key);
      keystack.push(peek = { key:lastKey, props:{ [key]:1 } });
    }
    parser.onkey = key => {
      processKey(key);
    };
    parser.oncloseobject = () => { keystack.pop(); peek = keystack[keystack.length-1] }; // TODO this will need some attention with more complex examples!
    parser.onopenarray = () => { /* don't care */ };
    parser.onclosearray = () => { /* don't care */ };
    parser.onend = () => resolve(duplicateKeys);

    parser.write(rawJson).close();
  });
}
