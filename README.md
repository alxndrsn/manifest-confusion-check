manifest-confusion-check
========================

<img src="https://github.com/alxndrsn/manifest-confusion-check/actions/workflows/node.js.yml/badge.svg"/>

Manifest Confusion detecter.

Ref: https://blog.vlt.sh/blog/the-massive-hole-in-the-npm-ecosystem

Check npm registry manifests vs dependencies in `node_modules`, `yarn.lock` and/or `package-lock.json`.

For details of what is checked, see the source code.

# Usage

```sh
npx manifest-confusion-check
```

# TODO

* implement `yarn.lock` support
* add error codes
* `process.exit(1)` if there are errors
* implement duplicate key checks
* add licence
* on release, update CHANGELOG.md

# See Also

* https://github.com/panki27/npm-manifest-check (Python)
