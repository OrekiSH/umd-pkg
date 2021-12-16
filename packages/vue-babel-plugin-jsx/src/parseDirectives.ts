import type * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import { createIdentifier } from './utils';
import type { State } from './interface';

export type Tag = t.Identifier | t.MemberExpression | t.StringLiteral | t.CallExpression;

/**
 * Get JSX element type
 *
 * @param path Path<JSXOpeningElement>
 */
const getType = (path: NodePath<t.JSXOpeningElement>, types: typeof t) => {
  const typePath = path
    .get('attributes')
    .find((attribute) => {
      if (!types.isJSXAttribute(attribute)) {
        return false;
      }
      return types.isJSXIdentifier(attribute.get('name'))
        && (attribute.get('name') as NodePath<t.JSXIdentifier>).node.name === 'type';
    }) as NodePath<t.JSXAttribute> | undefined;

  return typePath ? typePath.get('value').node : null;
};

const parseModifiers = (value: any, types: typeof t): string[] => (
  types.isArrayExpression(value)
    ? value.elements
      .map((el) => (types.isStringLiteral(el) ? el.value : ''))
      .filter(Boolean)
    : []);

const parseDirectives = (params: {
  name: string,
  path: NodePath<t.JSXAttribute>,
  value: t.Expression | null,
  state: State,
  tag: Tag,
  isComponent: boolean,
}, types: typeof t) => {
  const {
    path, value, state, tag, isComponent,
  } = params;
  const args: Array<t.Expression | t.NullLiteral> = [];
  const vals: t.Expression[] = [];
  const modifiersSet: Set<string>[] = [];

  let directiveName;
  let directiveArgument;
  let directiveModifiers;
  if ('namespace' in path.node.name) {
    [directiveName, directiveArgument] = params.name.split(':');
    directiveName = path.node.name.namespace.name;
    directiveArgument = path.node.name.name.name;
    directiveModifiers = directiveArgument.split('_').slice(1);
  } else {
    const underscoreModifiers = params.name.split('_');
    directiveName = underscoreModifiers.shift() || '';
    directiveModifiers = underscoreModifiers;
  }
  directiveName = directiveName
    .replace(/^v/, '')
    .replace(/^-/, '')
    .replace(/^\S/, (s: string) => s.toLowerCase());

  if (directiveArgument) {
    args.push(types.stringLiteral(directiveArgument));
  }

  const isVModels = directiveName === 'models';
  const isVModel = directiveName === 'model';
  if (isVModel && !types.isJSXExpressionContainer(path.get('value'))) {
    throw new Error('You have to use JSX Expression inside your v-model');
  }

  if (isVModels && !isComponent) {
    throw new Error('v-models can only use in custom components');
  }

  const shouldResolve = !['html', 'text', 'model', 'models'].includes(directiveName)
    || (isVModel && !isComponent);

  let modifiers = directiveModifiers;

  if (types.isArrayExpression(value)) {
    const elementsList = isVModels ? value.elements! : [value];

    elementsList.forEach((element) => {
      if (isVModels && !types.isArrayExpression(element)) {
        throw new Error('You should pass a Two-dimensional Arrays to v-models');
      }

      const { elements } = element as t.ArrayExpression;
      const [first, second, third] = elements;

      if (second && !types.isArrayExpression(second) && !types.isSpreadElement(second)) {
        args.push(second);
        modifiers = parseModifiers(third as t.ArrayExpression, types);
      } else if (types.isArrayExpression(second)) {
        if (!shouldResolve) {
          args.push(types.nullLiteral());
        }
        modifiers = parseModifiers(second, types);
      } else if (!shouldResolve) {
        // work as v-model={[value]} or v-models={[[value]]}
        args.push(types.nullLiteral());
      }
      modifiersSet.push(new Set(modifiers));
      vals.push(first as t.Expression);
    });
  } else if (isVModel && !shouldResolve) {
    // work as v-model={value}
    args.push(types.nullLiteral());
    modifiersSet.push(new Set(directiveModifiers));
  } else {
    modifiersSet.push(new Set(directiveModifiers));
  }

  return {
    directiveName,
    modifiers: modifiersSet,
    values: vals.length ? vals : [value],
    args,
    directive: shouldResolve ? [
      resolveDirective(path, state, tag, directiveName, types),
      vals[0] || value,
      modifiersSet[0]?.size
        ? args[0] || types.unaryExpression('void', types.numericLiteral(0), true)
        : args[0],
      !!modifiersSet[0]?.size && types.objectExpression(
        [...modifiersSet[0]].map(
          (modifier) => types.objectProperty(
            types.identifier(modifier),
            types.booleanLiteral(true),
          ),
        ),
      ),
    ].filter(Boolean) as t.Expression[] : undefined,
  };
};

const resolveDirective = (
  path: NodePath<t.JSXAttribute>,
  state: State,
  tag: Tag,
  directiveName: string,
  types: typeof t,
) => {
  if (directiveName === 'show') {
    return createIdentifier(state, 'vShow');
  }
  if (directiveName === 'model') {
    let modelToUse;
    const type = getType(path.parentPath as NodePath<t.JSXOpeningElement>, types);
    switch ((tag as t.StringLiteral).value) {
      case 'select':
        modelToUse = createIdentifier(state, 'vModelSelect');
        break;
      case 'textarea':
        modelToUse = createIdentifier(state, 'vModelText');
        break;
      default:
        if (types.isStringLiteral(type) || !type) {
          switch ((type as t.StringLiteral)?.value) {
            case 'checkbox':
              modelToUse = createIdentifier(state, 'vModelCheckbox');
              break;
            case 'radio':
              modelToUse = createIdentifier(state, 'vModelRadio');
              break;
            default:
              modelToUse = createIdentifier(state, 'vModelText');
          }
        } else {
          modelToUse = createIdentifier(state, 'vModelDynamic');
        }
    }
    return modelToUse;
  }
  return types.callExpression(
    createIdentifier(state, 'resolveDirective'), [
      types.stringLiteral(directiveName),
    ],
  );
};

export default parseDirectives;
