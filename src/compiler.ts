import ts from 'typescript';
export const compilerOptions: ts.CompilerOptions = { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, strict: true, esModuleInterop: true, skipLibCheck: true, moduleResolution: ts.ModuleResolutionKind.Node10, allowJs: true, checkJs: false };
// Add a budget check inside loops, including nested loops and single statements.
// This keeps accidental infinite loops in an exercise from freezing the UI.
export const guardLoops: ts.TransformerFactory<ts.SourceFile> = context => source => {
  const visit: ts.Visitor = node => {
    const visited = ts.visitEachChild(node, visit, context);
    if (ts.isForStatement(visited) || ts.isWhileStatement(visited) || ts.isDoStatement(visited) || ts.isForInStatement(visited) || ts.isForOfStatement(visited)) {
      const check = context.factory.createExpressionStatement(context.factory.createCallExpression(context.factory.createIdentifier('__labGuard'), undefined, []));
      const body = context.factory.createBlock([check, ...(ts.isBlock(visited.statement) ? visited.statement.statements : [visited.statement])], true);
      if (ts.isForStatement(visited)) return context.factory.updateForStatement(visited, visited.initializer, visited.condition, visited.incrementor, body);
      if (ts.isWhileStatement(visited)) return context.factory.updateWhileStatement(visited, visited.expression, body);
      if (ts.isDoStatement(visited)) return context.factory.updateDoStatement(visited, body, visited.expression);
      if (ts.isForInStatement(visited)) return context.factory.updateForInStatement(visited, visited.initializer, visited.expression, body);
      return context.factory.updateForOfStatement(visited, visited.awaitModifier, visited.initializer, visited.expression, body);
    }
    return visited;
  };
  return ts.visitNode(source, visit) as ts.SourceFile;
};
export function transpile(code: string, filename: string) {
  return ts.transpileModule(`${code}\nexport {};`, { fileName: filename, compilerOptions, reportDiagnostics: true, transformers: { before: [guardLoops] } });
}
