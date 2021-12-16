import type * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import { addDefault } from '@umd-pkg/babel-helper-module-imports';
import {
  createIdentifier,
  transformJSXSpreadChild,
  transformJSXText,
  transformJSXExpressionContainer,
  walksScope,
  buildIIFE,
  isDirective,
  checkIsComponent,
  getTag,
  getJSXAttributeName,
  isOn,
  isConstant,
  dedupeProperties,
  transformJSXSpreadAttribute,
} from './utils';
import SlotFlags from './slotFlags';
import { PatchFlags } from './patchFlags';
import parseDirectives from './parseDirectives';
import type { State, Slots } from './interface';

const xlinkRE = /^xlink([A-Z])/;

type ExcludesBoolean = <T>(x: T | false | true) => x is T;

const getJSXAttributeValue = (
  path: NodePath<t.JSXAttribute>,
  state: State,
  types: typeof t,
): (
  t.StringLiteral | t.Expression | null
  ) => {
  const valuePath = path.get('value');
  if (valuePath.isJSXElement()) {
    return transformJSXElement(valuePath, state, types);
  }
  if (valuePath.isStringLiteral()) {
    return valuePath.node;
  }
  if (valuePath.isJSXExpressionContainer()) {
    return transformJSXExpressionContainer(valuePath);
  }

  return null;
};

const buildProps = (path: NodePath<t.JSXElement>, state: State, types: typeof t) => {
  const tag = getTag(path, state, types);
  const isComponent = checkIsComponent(path.get('openingElement'), state);
  const props = path.get('openingElement').get('attributes');
  const directives: t.ArrayExpression[] = [];
  const dynamicPropNames = new Set<string>();

  let slots: Slots = null;
  let patchFlag = 0;

  if (props.length === 0) {
    return {
      tag,
      isComponent,
      slots,
      props: types.nullLiteral(),
      directives,
      patchFlag,
      dynamicPropNames,
    };
  }

  let properties: t.ObjectProperty[] = [];

  // patchFlag analysis
  let hasRef = false;
  let hasClassBinding = false;
  let hasStyleBinding = false;
  let hasHydrationEventBinding = false;
  let hasDynamicKeys = false;

  const mergeArgs: (t.CallExpression | t.ObjectExpression | t.Identifier)[] = [];
  const { mergeProps = true } = state.opts;
  props
    .forEach((prop) => {
      if (prop.isJSXAttribute()) {
        let name = getJSXAttributeName(prop, types);

        const attributeValue = getJSXAttributeValue(prop, state, types);

        if (!isConstant(attributeValue, types) || name === 'ref') {
          if (
            !isComponent
            && isOn(name)
            // omit the flag for click handlers becaues hydration gives click
            // dedicated fast path.
            && name.toLowerCase() !== 'onclick'
            // omit v-model handlers
            && name !== 'onUpdate:modelValue'
          ) {
            hasHydrationEventBinding = true;
          }

          if (name === 'ref') {
            hasRef = true;
          } else if (name === 'class' && !isComponent) {
            hasClassBinding = true;
          } else if (name === 'style' && !isComponent) {
            hasStyleBinding = true;
          } else if (
            name !== 'key'
            && !isDirective(name)
            && name !== 'on'
          ) {
            dynamicPropNames.add(name);
          }
        }
        if (state.opts.transformOn && (name === 'on' || name === 'nativeOn')) {
          if (!state.get('transformOn')) {
            state.set('transformOn', addDefault(
              path,
              '@vue/babel-helper-vue-transform-on',
              { nameHint: '_transformOn' },
              types,
            ));
          }
          mergeArgs.push(types.callExpression(
            state.get('transformOn'),
            [attributeValue || types.booleanLiteral(true)],
          ));
          return;
        }
        if (isDirective(name)) {
          const {
            directive, modifiers, values, args, directiveName,
          } = parseDirectives({
            tag,
            isComponent,
            name,
            path: prop,
            state,
            value: attributeValue,
          }, types);

          if (directiveName === 'slots') {
            slots = attributeValue as Slots;
            return;
          }
          if (directive) {
            directives.push(types.arrayExpression(directive));
          } else if (directiveName === 'html') {
            properties.push(types.objectProperty(
              types.stringLiteral('innerHTML'),
              values[0] as any,
            ));
            dynamicPropNames.add('innerHTML');
          } else if (directiveName === 'text') {
            properties.push(types.objectProperty(
              types.stringLiteral('textContent'),
              values[0] as any,
            ));
            dynamicPropNames.add('textContent');
          }

          if (['models', 'model'].includes(directiveName)) {
            values.forEach((value, index) => {
              const propName = args[index];
              // v-model target with variable
              const isDynamic = propName && !types.isStringLiteral(propName) && !types.isNullLiteral(propName);

              // must be v-model or v-models and is a component
              if (!directive) {
                properties.push(
                  types.objectProperty(types.isNullLiteral(propName)
                    ? types.stringLiteral('modelValue') : propName, value as any, isDynamic),
                );
                if (!isDynamic) {
                  dynamicPropNames.add((propName as t.StringLiteral)?.value || 'modelValue');
                }

                if (modifiers[index]?.size) {
                  properties.push(
                    types.objectProperty(
                      isDynamic
                        ? types.binaryExpression('+', propName, types.stringLiteral('Modifiers'))
                        : types.stringLiteral(`${(propName as t.StringLiteral)?.value || 'model'}Modifiers`),
                      types.objectExpression(
                        [...modifiers[index]].map((modifier) => types.objectProperty(
                          types.stringLiteral(modifier),
                          types.booleanLiteral(true),
                        )),
                      ),
                      isDynamic,
                    ),
                  );
                }
              }

              const updateName = isDynamic
                ? types.binaryExpression('+', types.stringLiteral('onUpdate'), propName)
                : types.stringLiteral(`onUpdate:${(propName as t.StringLiteral)?.value || 'modelValue'}`);

              properties.push(
                types.objectProperty(
                  updateName,
                  types.arrowFunctionExpression(
                    [types.identifier('$event')],
                    types.assignmentExpression('=', value as any, types.identifier('$event')),
                  ),
                  isDynamic,
                ),
              );

              if (!isDynamic) {
                dynamicPropNames.add((updateName as t.StringLiteral).value);
              } else {
                hasDynamicKeys = true;
              }
            });
          }
        } else {
          if (name.match(xlinkRE)) {
            name = name.replace(xlinkRE, (_, firstCharacter) => `xlink:${firstCharacter.toLowerCase()}`);
          }
          properties.push(types.objectProperty(
            types.stringLiteral(name),
            attributeValue || types.booleanLiteral(true),
          ));
        }
      } else {
        if (properties.length && mergeProps) {
          mergeArgs.push(types.objectExpression(dedupeProperties(properties, mergeProps, types)));
          properties = [];
        }

        // JSXSpreadAttribute
        hasDynamicKeys = true;
        transformJSXSpreadAttribute(
          path as NodePath,
          prop as NodePath<t.JSXSpreadAttribute>,
          mergeProps,
          mergeProps ? mergeArgs : properties,
          types,
        );
      }
    });

  // patchFlag analysis
  if (hasDynamicKeys) {
    patchFlag |= PatchFlags.FULL_PROPS;
  } else {
    if (hasClassBinding) {
      patchFlag |= PatchFlags.CLASS;
    }
    if (hasStyleBinding) {
      patchFlag |= PatchFlags.STYLE;
    }
    if (dynamicPropNames.size) {
      patchFlag |= PatchFlags.PROPS;
    }
    if (hasHydrationEventBinding) {
      patchFlag |= PatchFlags.HYDRATE_EVENTS;
    }
  }

  if (
    (patchFlag === 0 || patchFlag === PatchFlags.HYDRATE_EVENTS)
    && (hasRef || directives.length > 0)
  ) {
    patchFlag |= PatchFlags.NEED_PATCH;
  }

  let propsExpression: t.Expression | t.ObjectProperty | t.Literal = types.nullLiteral();
  if (mergeArgs.length) {
    if (properties.length) {
      mergeArgs.push(types.objectExpression(dedupeProperties(properties, mergeProps, types)));
    }
    if (mergeArgs.length > 1) {
      propsExpression = types.callExpression(
        createIdentifier(state, 'mergeProps'),
        mergeArgs,
      );
    } else {
      // single no need for a mergeProps call
      propsExpression = mergeArgs[0];
    }
  } else if (properties.length) {
    // single no need for spread
    if (properties.length === 1 && types.isSpreadElement(properties[0])) {
      propsExpression = (properties[0] as unknown as t.SpreadElement).argument;
    } else {
      propsExpression = types.objectExpression(dedupeProperties(properties, mergeProps, types));
    }
  }

  return {
    tag,
    props: propsExpression,
    isComponent,
    slots,
    directives,
    patchFlag,
    dynamicPropNames,
  };
};

/**
 * Get children from Array of JSX children
 * @param paths Array<JSXText | JSXExpressionContainer  | JSXElement | JSXFragment>
 * @returns Array<Expression | SpreadElement>
 */
const getChildren = (
  paths: NodePath<
  t.JSXText
  | t.JSXExpressionContainer
  | t.JSXSpreadChild
  | t.JSXElement
  | t.JSXFragment
  >[],
  state: State,
  types: typeof t,
): t.Expression[] => paths
  .map((path) => {
    if (path.isJSXText()) {
      const transformedText = transformJSXText(path, types);
      if (transformedText) {
        return types.callExpression(createIdentifier(state, 'createTextVNode'), [transformedText]);
      }
      return transformedText;
    }
    if (path.isJSXExpressionContainer()) {
      const expression = transformJSXExpressionContainer(path);

      if (types.isIdentifier(expression)) {
        const { name } = expression;
        const { referencePaths = [] } = path.scope.getBinding(name) || {};
        referencePaths.forEach((referencePath) => {
          walksScope(referencePath, name, SlotFlags.DYNAMIC, types);
        });
      }

      return expression;
    }
    if (types.isJSXSpreadChild(path)) {
      return transformJSXSpreadChild(path as NodePath<t.JSXSpreadChild>, types);
    }
    if (path.isCallExpression()) {
      return (path as NodePath<t.CallExpression>).node;
    }
    if (path.isJSXElement()) {
      return transformJSXElement(path, state, types);
    }
    throw new Error(`getChildren: ${path.type} is not supported`);
  }).filter(((value: any) => (
    value !== undefined
    && value !== null
    && !types.isJSXEmptyExpression(value)
  )) as any);

const transformJSXElement = (
  path: NodePath<t.JSXElement>,
  state: State,
  types: typeof t,
): t.CallExpression => {
  const children = getChildren(path.get('children'), state, types);
  const {
    tag,
    props,
    isComponent,
    directives,
    patchFlag,
    dynamicPropNames,
    slots,
  } = buildProps(path, state, types);

  const { optimize = false } = state.opts;

  const slotFlag = path.getData('slotFlag') || SlotFlags.STABLE;
  let VNodeChild;

  if (children.length > 1 || slots) {
    /*
      <A v-slots={slots}>{a}{b}</A>
        ---> {{ default: () => [a, b], ...slots }}
        ---> {[a, b]}
    */
    VNodeChild = isComponent
      ? children.length
        ? types.objectExpression([
          !!children.length && types.objectProperty(
            types.identifier('default'),
            types.arrowFunctionExpression([], types.arrayExpression(buildIIFE(path, children, types))),
          ),
          ...(slots ? (
            types.isObjectExpression(slots)
              ? (slots! as t.ObjectExpression).properties
              : [types.spreadElement(slots!)]
          ) : []),
          optimize && types.objectProperty(
            types.identifier('_'),
            types.numericLiteral(slotFlag),
          ),
        ].filter(Boolean as any))
        : slots
      : types.arrayExpression(children);
  } else if (children.length === 1) {
    /*
      <A>{a}</A> or <A>{() => a}</A>
     */
    const { enableObjectSlots = true } = state.opts;
    const child = children[0];
    const objectExpression = types.objectExpression([
      types.objectProperty(
        types.identifier('default'),
        types.arrowFunctionExpression([], types.arrayExpression(buildIIFE(path, [child], types))),
      ),
      optimize && types.objectProperty(
        types.identifier('_'),
        types.numericLiteral(slotFlag),
      ) as any,
    ].filter(Boolean));
    if (types.isIdentifier(child) && isComponent) {
      VNodeChild = enableObjectSlots ? types.conditionalExpression(
        types.callExpression(state.get('@vue/babel-plugin-jsx/runtimeIsSlot')(), [child]),
        child,
        objectExpression,
      ) : objectExpression;
    } else if (
      types.isCallExpression(child) && child.loc && isComponent
    ) { // the element was generated and doesn't have location information
      if (enableObjectSlots) {
        const { scope } = path;
        const slotId = scope.generateUidIdentifier('slot');
        if (scope) {
          scope.push({
            id: slotId,
            kind: 'let',
          });
        }
        const alternate = types.objectExpression([
          types.objectProperty(
            types.identifier('default'),
            types.arrowFunctionExpression([], types.arrayExpression(buildIIFE(path, [slotId], types))),
          ), optimize && types.objectProperty(
            types.identifier('_'),
            types.numericLiteral(slotFlag),
          ) as any,
        ].filter(Boolean));
        const assignment = types.assignmentExpression('=', slotId, child);
        const condition = types.callExpression(
          state.get('@vue/babel-plugin-jsx/runtimeIsSlot')(),
          [assignment],
        );
        VNodeChild = types.conditionalExpression(
          condition,
          slotId,
          alternate,
        );
      } else {
        VNodeChild = objectExpression;
      }
    } else if (types.isFunctionExpression(child) || types.isArrowFunctionExpression(child)) {
      VNodeChild = types.objectExpression([
        types.objectProperty(
          types.identifier('default'),
          child,
        ),
      ]);
    } else if (types.isObjectExpression(child)) {
      VNodeChild = types.objectExpression([
        ...child.properties,
        optimize && types.objectProperty(
          types.identifier('_'),
          types.numericLiteral(slotFlag),
        ),
      ].filter(Boolean as any));
    } else {
      VNodeChild = isComponent ? types.objectExpression([
        types.objectProperty(
          types.identifier('default'),
          types.arrowFunctionExpression([], types.arrayExpression([child])),
        ),
      ]) : types.arrayExpression([child]);
    }
  }

  const createVNode = types.callExpression(createIdentifier(state, 'createVNode'), [
    tag,
    props,
    VNodeChild || types.nullLiteral(),
    !!patchFlag && optimize && types.numericLiteral(patchFlag),
    !!dynamicPropNames.size && optimize
    && types.arrayExpression(
      [...dynamicPropNames.keys()].map((name) => types.stringLiteral(name)),
    ),
  ].filter(Boolean as unknown as ExcludesBoolean));

  if (!directives.length) {
    return createVNode;
  }

  return types.callExpression(createIdentifier(state, 'withDirectives'), [
    createVNode,
    types.arrayExpression(directives),
  ]);
};

export default function genTransformVueJSX(types: typeof t) {
  return {
    JSXElement: {
      exit(path: NodePath<t.JSXElement>, state: State) {
        path.replaceWith(transformJSXElement(path, state, types));
      },
    },
  };
};
