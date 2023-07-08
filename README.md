manifest-confusion-check
========================

Manifest Confusion detecter.

Ref: https://blog.vlt.sh/blog/the-massive-hole-in-the-npm-ecosystem

Check npm registry manifests vs dependencies in `node_modules`, `yarn.lock` and/or `package-lock.json`.

For details of what is checked, see the source code.

# Usage

```sh
node ${PATH_TO_THIS_SOURCE}/src/index.js
```

# TODO

* implement `yarn.lock` support
* fix bin script
* add error codes
* `process.exit(1)` if there are errors
* implement duplicate key checks
* add licence

# See Also

* https://github.com/panki27/npm-manifest-check (Python)
