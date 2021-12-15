import assert from "assert";
/**
 * A class to track and accumulate mutations to the AST that will eventually
 * output a new require/import statement list.
 */
export default class ImportBuilder {
  _statements = [];
  _resultName = null;

  _scope = null;
  _hub = null;
  _t = null;
  private _importedSource: any;

  constructor(importedSource, scope, hub, types) {
    this._scope = scope;
    this._hub = hub;
    this._importedSource = importedSource;
    this._t = types;
  }

  done() {
    return {
      statements: this._statements,
      resultName: this._resultName,
    };
  }

  import() {
    this._statements.push(
      this._t.importDeclaration([], this._t.stringLiteral(this._importedSource)),
    );
    return this;
  }

  require() {
    this._statements.push(
      this._t.expressionStatement(
        this._t.callExpression(this._t.identifier("require"), [
          this._t.stringLiteral(this._importedSource),
        ]),
      ),
    );
    return this;
  }

  namespace(name = "namespace") {
    const local = this._scope.generateUidIdentifier(name);

    const statement = this._statements[this._statements.length - 1];
    assert(statement.type === "ImportDeclaration");
    assert(statement.specifiers.length === 0);
    statement.specifiers = [this._t.importNamespaceSpecifier(local)];
    this._resultName = this._t.cloneNode(local);
    return this;
  }
  default(name) {
    name = this._scope.generateUidIdentifier(name);
    const statement = this._statements[this._statements.length - 1];
    assert(statement.type === "ImportDeclaration");
    assert(statement.specifiers.length === 0);
    statement.specifiers = [this._t.importDefaultSpecifier(name)];
    this._resultName = this._t.cloneNode(name);
    return this;
  }
  named(name, importName) {
    if (importName === "default") return this.default(name);

    name = this._scope.generateUidIdentifier(name);
    const statement = this._statements[this._statements.length - 1];
    assert(statement.type === "ImportDeclaration");
    assert(statement.specifiers.length === 0);
    statement.specifiers = [this._t.importSpecifier(name, this._t.identifier(importName))];
    this._resultName = this._t.cloneNode(name);
    return this;
  }

  var(name) {
    name = this._scope.generateUidIdentifier(name);
    let statement = this._statements[this._statements.length - 1];
    if (statement.type !== "ExpressionStatement") {
      assert(this._resultName);
      statement = this._t.expressionStatement(this._resultName);
      this._statements.push(statement);
    }
    this._statements[this._statements.length - 1] = this._t.variableDeclaration("var", [
      this._t.variableDeclarator(name, statement.expression),
    ]);
    this._resultName = this._t.cloneNode(name);
    return this;
  }

  defaultInterop() {
    return this._interop(this._hub.addHelper("interopRequireDefault"));
  }
  wildcardInterop() {
    return this._interop(this._hub.addHelper("interopRequireWildcard"));
  }

  _interop(callee) {
    const statement = this._statements[this._statements.length - 1];
    if (statement.type === "ExpressionStatement") {
      statement.expression = this._t.callExpression(callee, [statement.expression]);
    } else if (statement.type === "VariableDeclaration") {
      assert(statement.declarations.length === 1);
      statement.declarations[0].init = this._t.callExpression(callee, [
        statement.declarations[0].init,
      ]);
    } else {
      assert.fail("Unexpected type.");
    }
    return this;
  }

  prop(name) {
    const statement = this._statements[this._statements.length - 1];
    if (statement.type === "ExpressionStatement") {
      statement.expression = this._t.memberExpression(
        statement.expression,
        this._t.identifier(name),
      );
    } else if (statement.type === "VariableDeclaration") {
      assert(statement.declarations.length === 1);
      statement.declarations[0].init = this._t.memberExpression(
        statement.declarations[0].init,
        this._t.identifier(name),
      );
    } else {
      assert.fail("Unexpected type:" + statement.type);
    }
    return this;
  }

  read(name) {
    this._resultName = this._t.memberExpression(this._resultName, this._t.identifier(name));
  }
}