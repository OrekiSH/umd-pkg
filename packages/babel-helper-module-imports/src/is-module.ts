import type { NodePath } from "@babel/traverse";
import type * as t from "@babel/types";

/**
 * A small utility to check if a file qualifies as a module.
 */
export default function isModule(path: NodePath<t.Program>) {
  const { sourceType } = path.node;
  if (sourceType !== "module" && sourceType !== "script") {
    throw path.buildCodeFrameError(
      `Unknown sourceType "${sourceType}", cannot transform.`,
    );
  }

  return path.node.sourceType === "module";
}