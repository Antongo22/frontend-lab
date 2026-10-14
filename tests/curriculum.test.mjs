import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { lessons } from '../src/curriculum.ts';
import { compilerOptions, transpile } from '../src/compiler.ts';

test('Each track has six distinct, usable lessons', () => {
  assert.equal(new Set(lessons.map(l => l.id)).size, 18);
  for (const track of ['js','ts','react']) assert.equal(lessons.filter(l=>l.track===track).length,6);
  for (const lesson of lessons) { assert.ok(lesson.theory.length >= 3); assert.ok(lesson.checks.length > 0); assert.ok(lesson.starter !== lesson.solution); }
});
for (const lesson of lessons) {
  test(`${lesson.id}: starter and solution compile`, () => {
    const filename = `${process.cwd()}/src/__exercise__.${lesson.track === 'react' ? 'tsx' : lesson.track}`;
    for (const [label, code] of [['starter',lesson.starter],['solution',lesson.solution]]) {
      const output = transpile(code, filename);
      assert.equal((output.diagnostics ?? []).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,label);
      if (lesson.track !== 'js') {
        const host = ts.createCompilerHost(compilerOptions);
        const original = host.getSourceFile;
        host.getSourceFile = (path, version, ...rest) => path === filename ? ts.createSourceFile(path,code+'\nexport {};',version,true) : original(path,version,...rest);
        const program = ts.createProgram([filename],{...compilerOptions,noEmit:true},host);
        const errors = ts.getPreEmitDiagnostics(program).filter(d=>d.category === ts.DiagnosticCategory.Error);
        assert.deepEqual(errors.map(d=>ts.flattenDiagnosticMessageText(d.messageText,'\n')),[],label);
      }
    }
  });
  if (lesson.track !== 'react' && lesson.id !== 'js-dom') test(`${lesson.id}: solution passes behavioral checks`, async () => {
    const output = transpile(lesson.solution, 'main.ts').outputText;
    const suffix = `;return (async()=>[${lesson.checks.map(c=>`Boolean(${c.expression})`).join(',')}])();`;
    const execute = new Function('exports','__labGuard','console',output+suffix);
    const results = await execute({},()=>{}, {log:()=>{}});
    assert.ok(results.every(Boolean));
  });
}
test('Loops are guarded, including a loop with a single-statement body',()=>{
  for(const code of ['while(true) {}','for(;;) console.log(1);','do {} while(true);','for(const x of [1]) while(true) {}']) {
    let budget = 10;
    const output = transpile(code,'main.js').outputText;
    assert.throws(()=>vm.runInNewContext(output,{exports:{}, console:{log:()=>{}}, __labGuard:()=>{if(--budget<0)throw new Error('budget');}},{timeout:1000}),/budget/);
  }
});
test('Syntax errors are reported before execution',()=>{
  const output=transpile('const value = ;','main.ts');
  assert.ok(output.diagnostics.some(d=>d.category===ts.DiagnosticCategory.Error));
});
