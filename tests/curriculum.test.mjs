import test from 'node:test';
import assert from 'node:assert/strict';
import ts from 'typescript';
import vm from 'node:vm';
import { lessons } from '../src/curriculum.ts';
import { compilerOptions, transpile } from '../src/compiler.ts';

test('Each track has sixteen distinct, usable lessons including JWT', () => {
  assert.equal(new Set(lessons.map(l => l.id)).size, 48);
  for (const track of ['js','ts','react']) assert.equal(lessons.filter(l=>l.track===track).length,16);
  for (const lesson of lessons) { assert.ok(lesson.theory.length >= 3); assert.ok(lesson.checks.length > 0); assert.ok(lesson.starter !== lesson.solution); }
});
test('Existing lesson IDs and their ordering remain compatible with saved progress',()=>{
  const original = {
    js:['js-values','js-functions','js-arrays','js-objects','js-dom','js-async'],
    ts:['ts-basics','ts-interfaces','ts-unions','ts-generics','ts-utilities','ts-result'],
    react:['react-components','react-props','react-state','react-lists','react-forms','react-effects'],
  };
  for(const [track,ids] of Object.entries(original)) assert.deepEqual(lessons.filter(l=>l.track===track).slice(0,6).map(l=>l.id),ids);
});
for (const id of ['ts-mapped','ts-conditional','ts-infer','ts-satisfies']) {
  test(`${id}: incorrect type-only starter is rejected by the assignment contract`,()=>{
    const lesson=lessons.find(l=>l.id===id);
    const filename=`${process.cwd()}/src/__type_test__.ts`;
    const host=ts.createCompilerHost(compilerOptions);
    const original=host.getSourceFile;
    host.getSourceFile=(path,version,...rest)=>path===filename?ts.createSourceFile(path,lesson.starter+'\n'+lesson.typeChecks+'\nexport {};',version,true):original(path,version,...rest);
    const errors=ts.getPreEmitDiagnostics(ts.createProgram([filename],{...compilerOptions,noEmit:true},host)).filter(d=>d.category===ts.DiagnosticCategory.Error);
    assert.ok(errors.length>0,'Type checks must reject the starter even if its runtime output is valid');
  });
}
for (const lesson of lessons) {
  test(`${lesson.id}: starter and solution compile`, () => {
    const filename = `${process.cwd()}/src/__exercise__.${lesson.track === 'react' ? 'tsx' : lesson.track}`;
    for (const [label, code] of [['starter',lesson.starter],['solution',lesson.solution]]) {
      const output = transpile(code, filename);
      assert.equal((output.diagnostics ?? []).filter(d=>d.category===ts.DiagnosticCategory.Error).length,0,label);
      if (lesson.track !== 'js') {
        const host = ts.createCompilerHost(compilerOptions);
        const original = host.getSourceFile;
        const typeChecks = label === 'solution' ? (lesson.typeChecks ?? '') : '';
        host.getSourceFile = (path, version, ...rest) => path === filename ? ts.createSourceFile(path,code+'\n'+typeChecks+'\nexport {};',version,true) : original(path,version,...rest);
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
