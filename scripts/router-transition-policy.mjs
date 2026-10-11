import ts from 'typescript';

/** Inspect executable module providers rather than comments or unused feature calls. */
export function hasConfiguredNativeTransitions(source) {
  const file = ts.createSourceFile('routing.ts', source, ts.ScriptTarget.Latest, true);
  const imported = new Map();
  const constants = new Map();
  for (const statement of file.statements) {
    if (ts.isImportDeclaration(statement) && ts.isStringLiteral(statement.moduleSpecifier)) {
      const bindings = statement.importClause?.namedBindings;
      if (bindings && ts.isNamedImports(bindings)) {
        for (const name of bindings.elements) imported.set(name.name.text,
          `${statement.moduleSpecifier.text}:${(name.propertyName ?? name.name).text}`);
      }
    }
    if (ts.isVariableStatement(statement) && statement.declarationList.flags & ts.NodeFlags.Const) {
      for (const declaration of statement.declarationList.declarations) {
        if (ts.isIdentifier(declaration.name)) constants.set(declaration.name.text, declaration.initializer);
      }
    }
  }
  const isCall = (node, module, name) => ts.isCallExpression(node) && ts.isIdentifier(node.expression)
    && imported.get(node.expression.text) === `${module}:${name}`;
  const property = (node, name) => ts.isObjectLiteralExpression(node)
    ? node.properties.find(item => ts.isPropertyAssignment(item) && item.name.getText(file) === name)?.initializer
    : undefined;
  const optionsSkipInitial = node => {
    const options = node && ts.isIdentifier(node) ? constants.get(node.text) : node;
    return options && property(options, 'skipInitialTransition')?.kind === ts.SyntaxKind.TrueKeyword;
  };
  let configured = false;
  function visit(node) {
    if (isCall(node, '@angular/core', 'NgModule') && node.arguments[0]) {
      const providers = property(node.arguments[0], 'providers');
      configured ||= !!providers && ts.isArrayLiteralExpression(providers) && providers.elements.some(provider =>
        isCall(provider, '@angular/router', 'provideRouter') && provider.arguments.slice(1).some(feature =>
          isCall(feature, '@angular/router', 'withViewTransitions') && optionsSkipInitial(feature.arguments[0])));
    }
    ts.forEachChild(node, visit);
  }
  visit(file);
  return configured;
}
