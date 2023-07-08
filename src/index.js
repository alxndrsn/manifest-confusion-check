#!/usr/bin/env node

const { promisify } = require('node:util');
const exec = promisify(require('node:child_process').exec);
const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const Path = require('path');
const { URL } = require('node:url'); // eslint-disable-line no-shadow
const fetch = require('fetch-retry')(require('node-fetch')); // eslint-disable-line no-shadow
const getDuplicateKeys = require('./get-duplicate-keys');

const $0 = '[manifest-confusion-check]';

const FLAG_NPM = '--npm';
const FLAG_YARN = '--yarn';
const FLAG_NODE_MODULES = '--node_modules';
const FLAG_HELP = '--help';
const FLAG_VERBOSE = '--verbose';
const FLAG_SUPPRESS_OK = '--suppress-ok';
const FLAG_SUPPRESS_TODO = '--suppress-todo';
const ALLOWED_FLAGS = [FLAG_NPM, FLAG_YARN, FLAG_NODE_MODULES, FLAG_HELP, FLAG_VERBOSE, FLAG_SUPPRESS_OK, FLAG_SUPPRESS_TODO];

const PKG_LOCK = 'package-lock.json';
const YARN_LOCK = 'yarn.lock';
const NODE_MODULES = 'node_modules';

const cliArgs = process.argv.slice(2);

const verbose = cliArgs.includes(FLAG_VERBOSE);
const suppressOks = cliArgs.includes(FLAG_SUPPRESS_OK);
const suppressTodos = cliArgs.includes(FLAG_SUPPRESS_TODO);
const log = (...args) => verbose && console.error($0, ...args);
log('cliArgs:', cliArgs);
log('pwd:', process.cwd());

if(!cliArgs.every(arg => ALLOWED_FLAGS.includes(arg))) return fatalError(`Unrecognised flags.  Try ${FLAG_HELP}.`);

if(cliArgs.includes(FLAG_HELP)) return usage(console.log);

const requestedChecks = {
  [PKG_LOCK]:     cliArgs.includes(FLAG_NPM),
  [YARN_LOCK]:    cliArgs.includes(FLAG_YARN),
  [NODE_MODULES]: cliArgs.includes(FLAG_NODE_MODULES),
};

(async () => {
  log('Starting...');
  const jobs = [];
  const report = {};

  if(requestedChecks[PKG_LOCK])     jobs.push(processNpmLockfile(report));
  if(requestedChecks[YARN_LOCK])    jobs.push(processYarnLockfile(report));
  if(requestedChecks[NODE_MODULES]) jobs.push(processNodeModules(report));
  if(!jobs.length) {
    if(fs.existsSync(PKG_LOCK))  jobs.push(processNpmLockfile(report));
    if(fs.existsSync(YARN_LOCK)) jobs.push(processYarnLockfile(report));
    if(dirExists(NODE_MODULES))  jobs.push(processNodeModules(report));
  }

  if(!jobs.length) return fatalError(`No jobs requested!  Do you have a lockfile and/or node_modules?`);

  await Promise.all(jobs);

  Object.values(report)
      .forEach(items => Array.isArray(items) && items.sort((a, b) => {
        if(a.path === b.path) {
          if(a.type === b.type) {
            if(a.message === b.message) return 0;
            return a.message < b.message ? -1 : 1;
          }
          return a.type < b.type ? -1 : 1;
        }
        return a.path < b.path ? -1 : 1;
      }));

  log('Scan completed.');
  console.log(JSON.stringify(report, null, 2));
  log('Bye.');
})();

async function processNpmLockfile(_report) {
  const rep = _report[PKG_LOCK] = [];

  const rawPkgLock = fs.readFileSync(PKG_LOCK, { encoding:'utf8' }); // TODO confirm utf8 is a valid assumption

  await detectDuplicateKeys(rep, PKG_LOCK, rawPkgLock);

  const packageLock = parseJson(rep, PKG_LOCK, rawPkgLock);
  if(!packageLock) {
    repErr(rep, PKG_LOCK, `File not found: ${PKG_LOCK}!`);
    return;
  }

  const jobs = [];

  const { packages } = packageLock;
  let nextDelay = 0;
  for await (const [ key, { version, resolved } ] of Object.entries(packages)) {
    // can't use node-fetch delay here because we're using curl.  Add a random delay...
    jobs.push(new Promise((resolve, reject) => setTimeout(async () => {
      try {
        resolve(await validateNpmPackage(rep, { key, version, resolved }));
      } catch(err) {
        reject(err);
      }
    }, nextDelay)));
    nextDelay += 100; // 10 reqs/second
  }

  return Promise.all(jobs);
}
async function validateNpmPackage(report, { key, version, resolved }) {
  log('validateNpmPackage()', { key, version, resolved });
  const _path = PKG_LOCK + '::' + key;
  let hasErr = false;
  if(key==='') {
    // looks like the local project.  double check some things
    const thisPkg = JSON.parse(fs.readFileSync('./package.json', { encoding:'utf8' }));
    if(version !== thisPkg.version) { hasErr=true; repErr(report, _path, `Version mismatch with local project!`); }
    if(resolved !== undefined)      { hasErr=true; repErr(report, _path, `Unexpected prop value .resolve for local project!`); }
  } else {
    if(!key.startsWith('node_modules/')) {
      repErr(report, _path, `No handling for path resolution outside node_modules dir!`);
      hasErr = true;
    }

    const pkgName = key.replaceAll(/(^|(.*\/))node_modules\//g, '');
    const shortPkgName=pkgName.replace(/^@[-_.0-9a-z]+\//, '');
    const resolvedExpected = `https://registry.npmjs.org/${pkgName}/-/${shortPkgName}-${version}.tgz`;
    if(resolved === resolvedExpected) {
      // ref wildcards: so far seen package.json at:
      //   * package/package.json
      //   * json5/package.json
      const rawRemotePkg = (await exec(`curl --output - ${resolvedExpected} | tar --wildcards -zxO '*/package.json'`)).stdout.toString();

      detectDuplicateKeys(report, resolvedExpected, rawRemotePkg);

      const remotePkg = parseJson(report, resolvedExpected, rawRemotePkg);
      if(!remotePkg) return;

      validatePackage(report, resolvedExpected, remotePkg);

      if(remotePkg.name !== pkgName) {
        repErr(report, resolvedExpected, `Package name mismatch: expected '${pkgName}', but found '${remotePkg.name}'!`);
        await comparePackageJsonWith(report, resolvedExpected, remotePkg, pkgName);
      }
      await comparePackageJsonWith(report, _path, remotePkg, remotePkg.name);

      repOkIfOk(report, _path);
    } else {
      repErr(report, _path, `Package resolved to unexpected URL!  ${JSON.stringify({ expected:resolvedExpected, actual:resolved })}`);
      hasErr = true;
    }
  }

  if(!hasErr) repOk(report, _path);
}


function processYarnLockfile(report) {
  report[YARN_LOCK] = 'TODO: this report has not been implemented yet.';
}

async function processNodeModules(report) {
  const rep = report[NODE_MODULES] = [];
  return processModulesDir(rep, NODE_MODULES);
}
async function processModulesDir(report, _path) {
  log('processModulesDir()', _path, 'ENTRY');
  const jobs = [];

  const dir = await fsPromises.opendir(_path);

  for await (const entry of dir) {
    const ePath = Path.join(_path, entry.name);
    if(entry.isFile()) log('Skipping file:', ePath);
    else if(entry.isDirectory()) jobs.push(processPackageDir(report, ePath));
    else if(entry.isSymbolicLink()) log('Skipping symlink:', ePath);
    else repErr(report, ePath, `No handling for directory entry '${entry}'.`);
  }

  log('processModulesDir()', _path, 'EXIT');
  return Promise.all(jobs);
}
async function processPackageDir(report, _path) {
  log('processPackageDir()', _path, 'ENTRY');
  const jobs = [];

  const dir = await fsPromises.opendir(_path);
  log(dir);
  for await (const entry of dir) {
    const ePath = Path.join(_path, entry.name);
    if(entry.isFile()) {
      if(entry.name === 'package.json') {
        const posixPath = Path.posix.resolve(_path);
        const NM_DIR = '/node_modules/';
        const lastIndex = posixPath.lastIndexOf(NM_DIR);
        if(lastIndex === -1) throw new Error(`Surprising lack of ${NM_DIR} dir in path '${posixPath}'!`);
        const expectedPackageName = posixPath.substring(lastIndex + NM_DIR.length);
        jobs.push(processPackageJson(report, ePath, expectedPackageName));
      }
      else log('Skipping:', ePath);
    } else if(entry.isDirectory()) {
      if(entry.name === 'node_modules') jobs.push(processModulesDir(report, ePath));
      else log('Skipping:', ePath);
    } else if(entry.isSymbolicLink()) {
      log('Skipping symlink:', ePath);
    } else repErr(report, ePath, `No handling for directory entry of this type.`);
  }

  log('processPackageDir()', _path, 'EXIT');
  return Promise.all(jobs);
}

async function processPackageJson(report, _path, expectedName) {
  const rawLocalPkg = fs.readFileSync(_path, { encoding:'utf8' }); // TODO confirm utf8 is a valid assumption

  await detectDuplicateKeys(report, _path, rawLocalPkg);

  const localPkg = parseJson(report, _path, rawLocalPkg);
  if(!localPkg) return;

  validatePackage(report, _path, localPkg);

  if(localPkg.name !== expectedName) {
    repErr(report, _path, `Package name mismatch: expected '${expectedName}', but found '${localPkg.name}'!`);
    await comparePackageJsonWith(report, _path, localPkg, expectedName);
  }
  await comparePackageJsonWith(report, _path, localPkg, localPkg.name);

  repOkIfOk(report, _path);
}

async function comparePackageJsonWith(report, _path, pkg, requestPackageName) {
  const remoteUrl = new URL(requestPackageName, 'https://registry.npmjs.com');
  const remotePath = remoteUrl.toString();

  const manifestRequestRes = await httpGet(remoteUrl);
  if(manifestRequestRes.status !== 200) {
    repErr(report, remotePath, `Manifest fetch returned non-200 status code '${manifestRequestRes.status}'`);
    return;
  }
  const rawRemoteManifest = manifestRequestRes.body;

  await detectDuplicateKeys(report, remotePath, rawRemoteManifest);

  const remoteManifest = parseJson(report, remotePath, rawRemoteManifest);
  if(!remoteManifest) return;

  const manifestPkg = remoteManifest.versions[pkg.version];
  if(!manifestPkg) {
    repErr(report, remoteUrl.toString(), `Requested version '${pkg.version}' not found in remote manifest!`);
    return;
  }
  validatePackage(report, remotePath, manifestPkg);

  if(manifestPkg.name !== requestPackageName) repErr(report, remotePath, `Package name mismatch: ${JSON.stringify({ expected:requestPackageName, manifest:manifestPkg.name })}`);

  log('pkg:',  pkg);
  log('manifestPkg:', manifestPkg);

  if(pkg.name !== manifestPkg.name) repErr(report, remotePath, `Package name mismatch: ${JSON.stringify({ expected:pkg.name, manifest:manifestPkg.name })}`);

  if(pkg.version !== manifestPkg.version) repErr(report, remotePath, `Package version mismatch: ${JSON.stringify({ expected:pkg.version, manifest:manifestPkg.version })}`);

  compareStrStrMaps(report, 'scripts',      pkg, manifestPkg, _path, remotePath);
  compareStrStrMaps(report, 'dependencies', pkg, manifestPkg, _path, remotePath);
}

function dirExists(path) {
  if(!fs.existsSync(path)) return false;
  const stats = fs.statSync(path);
  return stats.isDirectory();
}

function usage(out) {
  out(`
  USAGE
    ${$0} <flags>
  FLAGS
    ${ALLOWED_FLAGS.join('\n    ')}
  `);
}

function fatalError(message) {
  if(typeof message === 'string') console.log('!!!', message);
  else throw new Error(`No support for message of type ${typeof message}`);
  process.exit(1);
}

async function detectDuplicateKeys(report, _path, rawJson) {
  if(typeof rawJson !== 'string') throw new Error('Illegal arg.');

  const dupes = await getDuplicateKeys(rawJson);
  if(dupes.length) repErr(report, _path, `Duplicate JSON keys found: ${dupes.join(', ')}`);
}

// TODO there should be some spec for this...  For now, guess.
// * should only support lower-case letters, plus digits, dots and dashes, and
// * an optional org prefix (e.g. "@example/")
const SAFE_PACKAGE_NAME = /^(@[-_.0-9a-z]+\/)?[-_.0-9a-z]+$/;
function detectSuspectPackageName(report, _path, name) {
  if(name.match(SAFE_PACKAGE_NAME)) return;
  repErr(report, _path, `Suspect characters detected in package name: '${name}'.`);
}

function repTodo(report, path, message) {
  if(suppressTodos) return;
  return repEntry(report, path, 'TODO', message);
}
function repErr(report, path, message) {
  return repEntry(report, path, 'ERROR', message);
}
function repOk(report, path) {
  if(suppressOks) return;
  return repEntry(report, path, 'OK', 'OK');
}
function repEntry(report, path, type, message) {
  if(!Array.isArray(report))      throw new Error('report must be an array!');
  if(typeof path !== 'string')    throw new Error('path must be a string!');
  if(typeof type !== 'string')    throw new Error('type must be a string!');
  if(typeof message !== 'string') throw new Error('message must be a string!');
  const entry = { path, type, message };
  log('Pushing report entry:', JSON.stringify(entry));
  report.push(entry);
}
// TODO this function is quite a lazy thing to do
function repOkIfOk(report, path) {
  if(!report.some(r => r.path === path && r.type === 'ERROR')) repOk(report, path);
}

async function httpGet(url) {
  if(!(url instanceof URL)) throw new Error(`Illegal arg - expected a URL, but got: '${url}'`);
  switch(url.protocol) {
    case 'https:': return _httpsGet(url);
    default: throw new Error(`No support for supplied protocol in url: '${url}'`);
  }
}
async function _httpsGet(url) {
  const res = await fetch(url, { retries:3, retryDelay:1000 });
  if(res.ok) return { status:res.status, body:await res.text() };
  else return { status:res.status };
}

function parseJson(report, _path, rawJson) {
  try {
    return JSON.parse(rawJson);
  } catch(err) {
    repErr(report, _path, 'Failed to parse package JSON.');
    return;
  }
}

function validatePackage(report, _path, pkg) {
  detectSuspectPackageName(report, _path, pkg.name);

  if(typeof pkg.name !== 'string') repErr(report, _path, `Unexpected type for property .name: '${typeof pkg.name}`);
  if(typeof pkg.version !== 'string') repErr(report, _path, `Unexpected type for property .version: '${typeof pkg.version}`);

  if(!undefinedOrStrStrMap(pkg.scripts)) {
    repErr(report, _path, `Unexpected type for property or contents .scripts: '${typeof pkg.scripts}`);
  }
  if(!undefinedOrStrStrMap(pkg.dependencies)) {
    repErr(report, _path, `Unexpected type for property or contents .dependencies: '${typeof pkg.dependencies}`);
  }

  return pkg;
}
function undefinedOrStrStrMap(map) {
  if(map === undefined) return true;

  if(typeof map !== 'object') return false;

  return Object.entries(map)
      .every(([ name, value ]) => {
        return typeof name === 'string' && typeof value === 'string';
      });
}

function compareStrStrMaps(report, name, pkg, manifestPkg, localPath, remotePath) {
  const _path = localPath + ' <> ' + remotePath;
  pkg = pkg[name] || {};
  manifestPkg = manifestPkg[name] || {};

  const onlyLeft = [];
  const onlyRight = [];
  const common = new Set();
  const mismatched = {};

  const lKeys = Object.keys(pkg);
  const rKeys = Object.keys(manifestPkg);

  lKeys.forEach(lK => {
    if(rKeys.includes(lK)) common.add(lK);
    else onlyLeft.push(lK);
  });

  rKeys.forEach(rK => {
    if(lKeys.includes(rK)) common.add(rK);
    else onlyLeft.push(rK);
  });

  common.forEach(key => {
    const l = pkg[key];
    const r = manifestPkg[key];
    if(l !== r) mismatched[key] = { pkg:l, manifestPkg:r };
  });

  if(onlyLeft.length)   repErr(report, _path, `Key(s) only found in local package.${name}: '${onlyLeft}'`);
  if(onlyRight.length)  repErr(report, _path, `Key(s) only found in manifest.${name}: '${onlyRight}'`);
  if(mismatched.length) repErr(report, _path, `Mismatched versions found: '${JSON.stringify(mismatched)}'`);
}
