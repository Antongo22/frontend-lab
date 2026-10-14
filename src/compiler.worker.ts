import ts from 'typescript';
import { compilerOptions, transpile } from './compiler';
const rawLibraries = import.meta.glob('../node_modules/typescript/lib/lib*.d.ts', { eager: true, query: '?raw', import: 'default' });
const rawTypes = import.meta.glob(['../node_modules/@types/react/*.d.ts', '../node_modules/@types/react-dom/*.d.ts', '../node_modules/csstype/index.d.ts'], { eager: true, query: '?raw', import: 'default' });
const files: Record<string, string> = {};
for (const [path, content] of Object.entries(rawLibraries)) files['/lib/' + path.split('/').pop()] = content as string;
for (const [path, content] of Object.entries(rawTypes)) files[path.replace('..', '')] = content as string;
const sources = new Map<string, ts.SourceFile>();
self.onmessage = (event: MessageEvent<{ id: number; code: string; mode: string }>) => {
  const { id, code, mode } = event.data;
  try {
    const filename = mode === 'react' ? '/App.tsx' : mode === 'ts' ? '/main.ts' : '/main.js';
    const result = transpile(code, filename);
    let diagnostics = result.diagnostics ?? [];
    if (mode !== 'js') {
      const options = { ...compilerOptions, noEmit: true, types: ['react', 'react-dom'] };
      const current = `${code}\nexport {};`;
      const readFile = (path: string) => path === filename ? current : files[path];
      const host: ts.CompilerHost = {
        getSourceFile: (path, languageVersion) => {
          const content = readFile(path);
          if (content === undefined) return undefined;
          if (path === filename) return ts.createSourceFile(path, content, languageVersion, true);
          if (!sources.has(path)) sources.set(path, ts.createSourceFile(path, content, languageVersion, true));
          return sources.get(path);
        },
        getDefaultLibFileName: () => '/lib/lib.es2022.full.d.ts',
        writeFile: () => {}, getCurrentDirectory: () => '/',
        getDirectories: () => [], fileExists: path => readFile(path) !== undefined,
        readFile, getCanonicalFileName: path => path, useCaseSensitiveFileNames: () => true,
        getNewLine: () => '\n', directoryExists: path => Object.keys(files).some(file => file.startsWith(path + '/')),
        resolveModuleNames: (names, containingFile) => names.map(name => {
          const known: Record<string, string> = { 'react': '/node_modules/@types/react/index.d.ts', 'react/jsx-runtime': '/node_modules/@types/react/jsx-runtime.d.ts', 'react/jsx-dev-runtime': '/node_modules/@types/react/jsx-dev-runtime.d.ts', 'react-dom': '/node_modules/@types/react-dom/index.d.ts', 'react-dom/client': '/node_modules/@types/react-dom/client.d.ts', 'csstype': '/node_modules/csstype/index.d.ts' };
          let path = known[name];
          if (!path && name.startsWith('.')) {
            const segments = (containingFile.slice(0, containingFile.lastIndexOf('/')) + '/' + name).split('/');
            const normalized: string[] = [];
            for (const segment of segments) { if (segment === '..') normalized.pop(); else if (segment && segment !== '.') normalized.push(segment); }
            const base = '/' + normalized.join('/');
            path = [base + '.d.ts', base + '/index.d.ts', base].find(candidate => files[candidate] !== undefined) ?? '';
          }
          return path && files[path] !== undefined ? { resolvedFileName: path, extension: ts.Extension.Dts, isExternalLibraryImport: true } : undefined;
        }),
      };
      const program = ts.createProgram([filename], options, host);
      diagnostics = ts.getPreEmitDiagnostics(program).filter(diagnostic => !diagnostic.file || diagnostic.file.fileName === filename);
    }
    const formatted = diagnostics.filter(d => d.category === ts.DiagnosticCategory.Error).map(d => {
      const location = d.file && d.start !== undefined ? d.file.getLineAndCharacterOfPosition(d.start) : undefined;
      return { message: ts.flattenDiagnosticMessageText(d.messageText, '\n'), line: location ? location.line + 1 : undefined, column: location ? location.character + 1 : undefined };
    });
    self.postMessage({ id, output: result.outputText, diagnostics: formatted });
  } catch (error) { self.postMessage({ id, output: '', diagnostics: [{ message: String(error) }] }); }
};
