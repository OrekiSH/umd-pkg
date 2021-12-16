import type * as t from '@babel/types';
import type * as BabelCore from '@babel/core';
import type { NodePath } from '@babel/traverse';
import syntaxJsx from '@babel/plugin-syntax-jsx';
import { addNamed, isModule, addNamespace } from '@umd-pkg/babel-helper-module-imports';
import genTransformVueJSX from './transform-vue-jsx';
import genSugarFragment from './sugar-fragment';
import type { VueJSXPluginOptions, State } from './interface';

export { VueJSXPluginOptions };

const hasJSX = (parentPath: NodePath<t.Program>) => {
  let fileHasJSX = false;
  parentPath.traverse({
    JSXElement(path) {
      // skip ts error
      fileHasJSX = true;
      path.stop();
    },
    JSXFragment(path) {
      fileHasJSX = true;
      path.stop();
    },
  });

  return fileHasJSX;
};

const JSX_ANNOTATION_REGEX = /\*?\s*@jsx\s+([^\s]+)/;

export default ({ types, template }: typeof BabelCore) => ({
  name: 'babel-plugin-jsx',
  inherits: syntaxJsx,
  visitor: {
    ...genTransformVueJSX(types),
    ...genSugarFragment(types),
    Program: {
      enter(path: NodePath<t.Program>, state: State) {
        if (hasJSX(path)) {
          const importNames = [
            'createVNode',
            'Fragment',
            'resolveComponent',
            'withDirectives',
            'vShow',
            'vModelSelect',
            'vModelText',
            'vModelCheckbox',
            'vModelRadio',
            'vModelText',
            'vModelDynamic',
            'resolveDirective',
            'mergeProps',
            'createTextVNode',
            'isVNode',
          ];
          if (isModule(path)) {
            // import { createVNode } from "vue";
            const importMap: Record<string, t.Identifier> = {};
            importNames.forEach((name) => {
              state.set(name, () => {
                if (importMap[name]) {
                  return types.cloneNode(importMap[name]);
                }
                const identifier = addNamed(path, name, 'vue', {
                  ensureLiveReference: true,
                }, types);
                importMap[name] = identifier;
                return identifier;
              });
            });
            const { enableObjectSlots = true } = state.opts;
            if (enableObjectSlots) {
              state.set('@vue/babel-plugin-jsx/runtimeIsSlot', () => {
                if (importMap.runtimeIsSlot) {
                  return importMap.runtimeIsSlot;
                }
                const { name: isVNodeName } = state.get(
                  'isVNode',
                )() as t.Identifier;
                const isSlot = path.scope.generateUidIdentifier('isSlot');
                const ast = template.ast`
                  function ${isSlot.name}(s) {
                    return typeof s === 'function' || (Object.prototype.toString.call(s) === '[object Object]' && !${isVNodeName}(s));
                  }
                `;
                const lastImport = (path.get('body') as NodePath[])
                  .filter((p) => p.isImportDeclaration())
                  .pop();
                if (lastImport) {
                  lastImport.insertAfter(ast);
                }
                importMap.runtimeIsSlot = isSlot;
                return isSlot;
              });
            }
          } else {
            // var _vue = require('vue');
            let sourceName: t.Identifier;
            importNames.forEach((name) => {
              state.set(name, () => {
                if (!sourceName) {
                  sourceName = addNamespace(path, 'vue', {
                    ensureLiveReference: true,
                  }, types);
                }
                return types.memberExpression(sourceName, types.identifier(name));
              });
            });

            const helpers: Record<string, t.Identifier> = {};

            const { enableObjectSlots = true } = state.opts;
            if (enableObjectSlots) {
              state.set('@vue/babel-plugin-jsx/runtimeIsSlot', () => {
                if (helpers.runtimeIsSlot) {
                  return helpers.runtimeIsSlot;
                }
                const isSlot = path.scope.generateUidIdentifier('isSlot');
                const { object: objectName } = state.get(
                  'isVNode',
                )() as t.MemberExpression;
                const ast = template.ast`
                  function ${isSlot.name}(s) {
                    return typeof s === 'function' || (Object.prototype.toString.call(s) === '[object Object]' && !${(objectName as t.Identifier).name}.isVNode(s));
                  }
                `;

                const nodePaths = path.get('body') as NodePath[];
                const lastImport = nodePaths
                  .filter(
                    (p) => p.isVariableDeclaration()
                      && p.node.declarations.some(
                        (d) => (d.id as t.Identifier)?.name === sourceName.name,
                      ),
                  )
                  .pop();
                if (lastImport) {
                  lastImport.insertAfter(ast);
                }
                return isSlot;
              });
            }
          }

          const {
            opts: { pragma = '' },
            file,
          } = state;

          if (pragma) {
            state.set('createVNode', () => types.identifier(pragma));
          }

          if (file.ast.comments) {
            for (const comment of file.ast.comments) {
              const jsxMatches = JSX_ANNOTATION_REGEX.exec(comment.value);
              if (jsxMatches) {
                state.set('createVNode', () => types.identifier(jsxMatches[1]));
              }
            }
          }
        }
      },
      exit(path: NodePath<t.Program>) {
        const body = path.get('body') as NodePath[];
        const specifiersMap = new Map<string, t.ImportSpecifier>();

        body
          .filter(
            (nodePath) => types.isImportDeclaration(nodePath.node)
              && nodePath.node.source.value === 'vue',
          )
          .forEach((nodePath) => {
            const { specifiers } = nodePath.node as t.ImportDeclaration;
            let shouldRemove = false;
            specifiers.forEach((specifier) => {
              if (
                !specifier.loc
                && types.isImportSpecifier(specifier)
                && types.isIdentifier(specifier.imported)
              ) {
                specifiersMap.set(specifier.imported.name, specifier);
                shouldRemove = true;
              }
            });
            if (shouldRemove) {
              nodePath.remove();
            }
          });

        const specifiers = [...specifiersMap.keys()].map(
          (imported) => specifiersMap.get(imported)!,
        );
        if (specifiers.length) {
          path.unshiftContainer(
            'body',
            types.importDeclaration(specifiers, types.stringLiteral('vue')),
          );
        }
      },
    },
  },
});