import type * as t from '@babel/types';
import type { NodePath } from '@babel/traverse';
import type { State } from './interface';
import { createIdentifier, FRAGMENT } from './utils';

const transformFragment = (
  path: NodePath<t.JSXElement>,
  Fragment: t.JSXIdentifier | t.JSXMemberExpression,
  types: typeof t,
) => {
  const children = path.get('children') || [];
  return types.jsxElement(
    types.jsxOpeningElement(Fragment, []),
    types.jsxClosingElement(Fragment),
    children.map(({ node }) => node),
    false,
  );
};

export default function genSugarFragment(types: typeof t) {
  return {
    JSXFragment: {
      enter(path: NodePath<t.JSXElement>, state: State) {
        const fragmentCallee = createIdentifier(state, FRAGMENT);
        path.replaceWith(transformFragment(
          path,
          types.isIdentifier(fragmentCallee)
            ? types.jsxIdentifier(fragmentCallee.name)
            : types.jsxMemberExpression(
              types.jsxIdentifier((fragmentCallee.object as t.Identifier).name),
              types.jsxIdentifier((fragmentCallee.property as t.Identifier).name),
            ),
          types,
        ));
      },
    },
  };
};
