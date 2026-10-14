import type { Lesson, Track } from './curriculum';
export function previewDocument({ output, css, html, mode, id, checks = [] }: { output: string; css: string; html: string; mode: Track; id: number; checks?: Lesson['checks'] }) {
  const json = (value: unknown) => JSON.stringify(value).replace(/</g, '\\u003c');
  const runtimeUrl = new URL('runtime.js', document.baseURI).href;
  const testFunction = `\n;globalThis.__labCheck = async function() { const results = []; ${checks.map(check => `try { results.push({ label: ${json(check.label)}, passed: Boolean(${check.expression}) }); } catch(error) { results.push({ label: ${json(check.label)}, passed: false, error: String(error) }); }`).join('\n')} return results; };\nreturn typeof App === 'function' ? App : undefined;`;
  return `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'unsafe-inline' 'unsafe-eval' ${new URL(runtimeUrl).origin}; style-src 'unsafe-inline'; img-src data: https:; font-src data:; connect-src 'none'; form-action 'none'; base-uri 'none'"><title>Frontend Lab</title><style>${css.replace(/<\/style/gi, '<\\/style')}</style></head><body>${html}<script>
  (()=>{
    const runId = ${id}; let messageCount = 0;
    const send = (type, data) => { if (type !== 'console' || messageCount++ < 200) parent.postMessage({ source: 'frontend-lab', runId, type, data }, '*'); };
    const format = value => { if (typeof value === 'string') return value; if (value instanceof Error) return value.message; if (value === undefined) return 'undefined'; try { return JSON.stringify(value, null, 2); } catch { return String(value); } };
    ['log','info','warn','error','debug'].forEach(level => { console[level] = (...args) => send('console', {level, text: args.map(format).join(' ')}); });
    window.addEventListener('error', event => { event.preventDefault(); send('error', event.message); });
    window.addEventListener('unhandledrejection', event => { event.preventDefault(); send('error', String(event.reason)); });
    window.__labSend = send;
  })();
  </script>${mode === 'react' ? `<script src="${runtimeUrl}"></script>` : ''}<script>
  (async()=>{
    const send = window.__labSend;
    try {
      let deadline = performance.now() + 1500;
      let scheduled = false;
      const guard = () => { if (!scheduled) { scheduled = true; setTimeout(()=>{ deadline = performance.now()+1500; scheduled=false; },0); } if (performance.now() > deadline) throw new Error('Выполнение остановлено: цикл работает дольше 1.5 секунды. Проверь условие выхода.'); };
      const require = name => {
        if (name === 'react' && window.LabReact) return window.LabReact;
        if ((name === 'react-dom/client' || name === 'react-dom') && window.LabReactDOM) return window.LabReactDOM;
        if (name === 'react/jsx-runtime' && window.LabJSXRuntime) return window.LabJSXRuntime;
        throw new Error('Модуль '+ name +' недоступен. В песочнице подключены react и react-dom/client.');
      };
      const module = { exports: {} };
      const execute = new Function('require','module','exports','__labGuard', ${json(output + testFunction)});
      const App = execute(require, module, module.exports, guard);
      if (${json(mode)} === 'react') {
        const Component = module.exports.default || App;
        if (!Component) throw new Error('Экспортируй компонент: export default function App() { ... }');
        const root = document.getElementById('root');
        if (!root) throw new Error('В HTML нужен элемент с id="root".');
        window.LabReactDOM.createRoot(root).render(window.LabReact.createElement(Component));
      }
      await new Promise(resolve => setTimeout(resolve, 180));
      send('ready', null);
      if (${checks.length > 0}) send('checks', await window.__labCheck());
    } catch(error) {
      const root = document.getElementById('root') || document.body;
      const message = document.createElement('pre'); message.style.cssText = 'white-space:pre-wrap;padding:20px;color:#b34242;background:#fff0f0;border-radius:12px;font:13px/1.7 monospace';
      message.textContent = String(error); root.replaceChildren(message); send('error', String(error));
    }
  })();</script></body></html>`;
}
