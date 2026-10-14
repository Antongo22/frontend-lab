import test from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { lessons } from '../src/curriculum.ts';
import { transpile } from '../src/compiler.ts';

// A local DOM simulator: no page navigation or external resources are loaded.
const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', { pretendToBeVisual: true });
for (const key of ['window','document','HTMLElement','HTMLInputElement','Event','MouseEvent','Node']) globalThis[key] = key === 'window' ? dom.window : dom.window[key];
const React = await import('react');
const ReactDOM = await import('react-dom/client');
const JSXRuntime = await import('react/jsx-runtime');
const require = name => ({ react: React, 'react-dom/client': ReactDOM, 'react/jsx-runtime': JSXRuntime })[name];
const wait = ms => new Promise(resolve=>setTimeout(resolve,ms));

for (const lesson of lessons.filter(l=>l.track==='react' || l.id==='js-dom')) {
  test(`${lesson.id}: solution passes real React and DOM interactions`, async () => {
    document.body.innerHTML = '<div id="root"></div>';
    document.title = 'Frontend Lab';
    const output = transpile(lesson.solution, 'App.tsx').outputText;
    const tests = lesson.checks.map(check=>`try { results.push({label:${JSON.stringify(check.label)},passed:Boolean(${check.expression})}); } catch(error) { results.push({label:${JSON.stringify(check.label)},passed:false,error:String(error)}); }`).join('\n');
    const suffix = `;return async function() { const results=[]; ${tests}; return results; };`;
    const execute = new Function('require','module','exports','__labGuard','console',output+suffix);
    const module = { exports: {} };
    const check = execute(require,module,module.exports,()=>{}, { log:()=>{} });
    let root;
    try {
      if (lesson.track==='react') {
        root = ReactDOM.createRoot(document.getElementById('root'));
        root.render(React.createElement(module.exports.default));
        await wait(180);
      }
      const results = await check();
      assert.deepEqual(results.filter(r=>!r.passed),[],lesson.title);
    } finally { root?.unmount(); }
  });
}

test.after(()=>dom.window.close());
