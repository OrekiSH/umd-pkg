import type * as t from "@babel/types";
import ImportInjector from "./import-injector";

export { ImportInjector };

export { default as isModule } from "./is-module";

export function addDefault(path, importedSource, opts, types: typeof t) {
  return new ImportInjector(path).addDefault(importedSource, opts, types);
}

export function addNamed(path, name, importedSource, opts, types: typeof t) {
  return new ImportInjector(path).addNamed(name, importedSource, opts, types);
}

export function addNamespace(path, importedSource, opts, types: typeof t) {
  return new ImportInjector(path).addNamespace(importedSource, opts, types);
}

export function addSideEffect(path, importedSource, opts, types: typeof t) {
  return new ImportInjector(path).addSideEffect(importedSource, opts, types);
}