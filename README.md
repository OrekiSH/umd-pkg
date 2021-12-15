# umd-pkg

Harmony packages for umd/iife format

## @umd-pkg/babel-helper-module-imports

> Babel helper functions for inserting module loads

This is a fork of [@babel/helper-module-imports](https://babeljs.io/docs/en/babel-helper-module-imports) with a few changes:

- Add `types` parameter for @babel/standalone

``` js
// before
import { addSideEffect } from "@babel/helper-module-imports";
addSideEffect(path, 'source');

// after
import { addSideEffect } from "@umd-pkg/babel-helper-module-imports";
addSideEffect(path, 'source', t); // add `types`
```
