import { useEffect, useRef, useState } from 'react';
import { ArrowDownToLine, ArrowLeft, ArrowRight, Atom, BookOpen, Check, CheckCircle2, ChevronDown, ChevronRight, CircleHelp, Clock3, Code2, Expand, ExternalLink, FlaskConical, Lightbulb, Menu, Monitor, Play, RotateCcw, Search, Smartphone, Sparkles, Square, Terminal, Trophy, X } from 'lucide-react';
import Editor from './Editor';
import { defaultCSS, defaultHTML, lessons, sandboxStarters, tracks, type Track } from './curriculum';
import { previewDocument } from './preview';
type Draft = { code: string; css: string; html: string };
type Store = { version: 1; selected: string; drafts: Record<string, Draft>; completed: string[]; auto: boolean };
type CheckResult = { label: string; passed: boolean; error?: string };
type Diagnostic = { message: string; line?: number; column?: number };
const storageKey = 'frontend-lab-v1';
const initialStore: Store = { version: 1, selected: 'react-state', drafts: {}, completed: [], auto: true };
function readStore(): Store {
  try {
    const value = JSON.parse(localStorage.getItem(storageKey) || 'null');
    if (value?.version !== 1 || !Array.isArray(value.completed) || typeof value.drafts !== 'object' || !value.drafts) return initialStore;
    const drafts: Record<string, Draft> = {};
    for (const [key, draft] of Object.entries(value.drafts)) { const d = draft as Draft; if (d && typeof d.code === 'string' && typeof d.css === 'string' && typeof d.html === 'string') drafts[key] = d; }
    return { ...initialStore, drafts, selected: lessons.some(l=>l.id === value.selected) ? value.selected : initialStore.selected, completed: value.completed.filter((id: string)=>lessons.some(l=>l.id === id)), auto: typeof value.auto === 'boolean' ? value.auto : true };
  } catch { return initialStore; }
}
function download(name: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const link = document.createElement('a'); link.href = url; link.download = name; link.click(); URL.revokeObjectURL(url);
}
function TrackIcon({ track, size = 'small' }: { track: Track; size?: string }) {
  return <span className={`track-icon ${track} ${size}`}>{track === 'react' ? <Atom size={size === 'large' ? 31 : 19} strokeWidth={1.5} /> : tracks[track].short}</span>;
}
export default function App() {
  const [store, setStore] = useState<Store>(readStore);
  const [page, setPage] = useState<'lab' | 'library' | 'progress'>('lab');
  const [sandbox, setSandbox] = useState<Track | null>(null);
  const [file, setFile] = useState<'code' | 'css' | 'html'>('code');
  const [lessonTab, setLessonTab] = useState<'theory' | 'task'>('theory');
  const [hint, setHint] = useState(false);
  const [solution, setSolution] = useState(false);
  const [help, setHelp] = useState(false);
  const [query, setQuery] = useState('');
  const [sidebar, setSidebar] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);
  const [focus, setFocus] = useState(false);
  const [saved, setSaved] = useState(true);
  const [storageError, setStorageError] = useState(false);
  const [status, setStatus] = useState<'compiling' | 'ready' | 'error' | 'stopped'>('compiling');
  const [logs, setLogs] = useState<{level: string; text: string}[]>([]);
  const [diagnostics, setDiagnostics] = useState<Diagnostic[]>([]);
  const [checkResults, setCheckResults] = useState<CheckResult[] | null>(null);
  const [checking, setChecking] = useState(false);
  const [preview, setPreview] = useState('');
  const [outputTab, setOutputTab] = useState<'console' | 'problems'>('console');
  const frame = useRef<HTMLIFrameElement>(null);
  const canvas = useRef<HTMLDivElement>(null);
  const [frameSize, setFrameSize] = useState({ width: 320, height: 400 });
  const worker = useRef<Worker | null>(null);
  const runId = useRef(0);
  const lastRunInput = useRef('');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<{ id: number; draft: Draft; mode: Track; check: boolean; lessonId: string; checks: typeof lessons[number]['checks'] } | null>(null);
  const currentLesson = lessons.find(l => l.id === store.selected) ?? lessons[0];
  const mode = sandbox ?? currentLesson.track;
  const draftKey = sandbox ? `sandbox-${sandbox}` : currentLesson.id;
  const draft = store.drafts[draftKey] ?? { code: sandbox ? sandboxStarters[sandbox] : currentLesson.starter, css: defaultCSS, html: defaultHTML };
  const currentTrack = lessons.filter(l => l.track === mode);
  const lessonIndex = currentTrack.findIndex(l => l.id === currentLesson.id);
  const completedInTrack = currentTrack.filter(l => store.completed.includes(l.id)).length;
  const percentage = Math.round(store.completed.length / lessons.length * 100);
  const activeDraftKey = useRef(draftKey); activeDraftKey.current = draftKey;
  const stop = () => { runId.current++; pending.current = null; if (timer.current) clearTimeout(timer.current); setPreview(''); setStatus('stopped'); setChecking(false); };
  const run = (check = false) => {
    if (!worker.current) return;
    if (timer.current) clearTimeout(timer.current);
    const id = ++runId.current;
    lastRunInput.current = JSON.stringify([draftKey, draft]);
    pending.current = { id, draft: { ...draft }, mode, check, lessonId: currentLesson.id, checks: check && !sandbox ? currentLesson.checks : [] };
    setLogs([]); setDiagnostics([]); setStatus('compiling'); setChecking(check); setCheckResults(null);
    worker.current.postMessage({ id, code: draft.code, mode });
  };
  const runLatest = useRef(run); runLatest.current = run;
  useEffect(() => {
    const compiler = new Worker(new URL('./compiler.worker.ts', import.meta.url), { type: 'module' });
    worker.current = compiler;
    compiler.onmessage = (event: MessageEvent<{id: number; output: string; diagnostics: Diagnostic[]}>) => {
      const request = pending.current;
      if (!request || event.data.id !== runId.current) return;
      if (event.data.diagnostics.length) {
        setDiagnostics(event.data.diagnostics); setOutputTab('problems'); setStatus('error'); setChecking(false);
        setPreview('');
        return;
      }
      setPreview(previewDocument({ output: event.data.output, css: request.draft.css, html: request.draft.html, mode: request.mode, id: request.id, checks: request.checks }));
    };
    compiler.onerror = event => { setStatus('error'); setChecking(false); setDiagnostics([{ message: 'Не удалось запустить компилятор: ' + event.message }]); setOutputTab('problems'); };
    const receive = (event: MessageEvent) => {
      const data = event.data;
      if (event.source !== frame.current?.contentWindow || data?.source !== 'frontend-lab' || data.runId !== runId.current) return;
      if (data.type === 'console') setLogs(list => [...list.slice(-199), data.data]);
      if (data.type === 'ready') setStatus(current=>current === 'error' ? current : 'ready');
      if (data.type === 'error') { setStatus('error'); setChecking(false); setLogs(list => [...list.slice(-199), { level: 'error', text: data.data }]); setOutputTab('console'); }
      if (data.type === 'checks') {
        const results: CheckResult[] = data.data;
        setCheckResults(results); setChecking(false); setLessonTab('task');
        const request = pending.current;
        if (request?.check && results.length > 0 && results.every(result => result.passed) && activeDraftKey.current === request.lessonId) setStore(current=>({ ...current, completed: [...new Set([...current.completed, request.lessonId])] }));
      }
    };
    window.addEventListener('message', receive);
    return () => { compiler.terminate(); worker.current = null; window.removeEventListener('message', receive); };
  }, []);
  useEffect(() => {
    setSaved(false);
    const saving = setTimeout(() => { try { localStorage.setItem(storageKey, JSON.stringify(store)); setSaved(true); setStorageError(false); } catch { setStorageError(true); } }, 300);
    return () => clearTimeout(saving);
  }, [store]);
  useEffect(() => {
    setHint(false); setSolution(false); setFile('code'); setCheckResults(null); setDiagnostics([]); setLessonTab('theory');
    runLatest.current();
  }, [draftKey]);
  useEffect(() => {
    if (store.auto && page === 'lab' && lastRunInput.current !== JSON.stringify([draftKey, draft])) timer.current = setTimeout(() => runLatest.current(), 650);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [draftKey, draft.code, draft.css, draft.html, store.auto, page]);
  useEffect(() => {
    const shortcut = (event: KeyboardEvent) => { if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') { event.preventDefault(); runLatest.current(); } if (event.key === 'Escape') { setHelp(false); setSolution(false); setSidebar(false); setFocus(false); } };
    document.addEventListener('keydown', shortcut); return ()=>document.removeEventListener('keydown', shortcut);
  }, []);
  useEffect(() => {
    if (!canvas.current) return;
    const observer = new ResizeObserver(entries => {
      const { width, height } = entries[0].contentRect;
      // An explicit viewport avoids collapsed iframe documents inside mobile flex layouts.
      setFrameSize({ width: Math.floor(mobilePreview ? Math.min(width, 320) : width), height: Math.floor(height) });
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, [page, mobilePreview, focus]);
  const edit = (value: string) => { setCheckResults(null); setStore(current=>({ ...current, drafts: { ...current.drafts, [draftKey]: { ...draft, [file]: value } } })); };
  const selectLesson = (id: string) => { setStore(current=>({ ...current, selected: id })); setSandbox(null); setPage('lab'); setSidebar(false); setQuery(''); };
  const selectTrack = (track: Track) => { if (sandbox) { setSandbox(track); setPage('lab'); } else selectLesson(lessons.find(l=>l.track === track && !store.completed.includes(l.id))?.id ?? lessons.find(l=>l.track === track)!.id); };
  const enterSandbox = (track = mode) => { setSandbox(track); setPage('lab'); setSidebar(false); };
  const filename = file === 'css' ? 'styles.css' : file === 'html' ? 'index.html' : mode === 'react' ? 'App.tsx' : `main.${mode}`;
  const nextLesson = currentTrack[lessonIndex + 1];
  const reset = () => { if (window.confirm('Вернуть исходный код, CSS и HTML? Текущие изменения этого примера будут заменены.')) setStore(current=>{ const drafts = { ...current.drafts }; delete drafts[draftKey]; return { ...current, drafts }; }); };
  return <div className={`app-shell ${focus ? 'focus-mode' : ''}`}>
    <aside className={`sidebar ${sidebar ? 'is-open' : ''}`}>
      <a className="brand" href="#" onClick={event=>{event.preventDefault();setPage('lab');}}><span className="brand-mark"><Code2 size={22}/></span><span>frontend<span className="brand-light">lab</span><small>УЧИСЬ ЧЕРЕЗ КОД</small></span></a>
      <div className="side-caption">ТВОЁ ПРОСТРАНСТВО</div>
      <nav className="primary-nav" aria-label="Главная навигация">
        <button className={page === 'lab' && !sandbox ? 'active' : ''} onClick={()=>{setPage('lab');setSandbox(null);setSidebar(false);}}><BookOpen size={18}/>Практикум<span className="nav-dot"/></button>
        <button className={page === 'library' ? 'active' : ''} onClick={()=>{setPage('library');setSidebar(false);}}><Code2 size={18}/>Все уроки<span className="nav-count">18</span></button>
        <button className={sandbox && page === 'lab' ? 'active' : ''} onClick={()=>enterSandbox()}><FlaskConical size={18}/>Песочница<small>свободно</small></button>
        <button className={page === 'progress' ? 'active' : ''} onClick={()=>{setPage('progress');setSidebar(false);}}><Trophy size={18}/>Мой прогресс</button>
      </nav>
      <div className="side-divider"/>
      <div className="side-caption track-caption">УЧЕБНЫЕ ТРЕКИ <span>03</span></div>
      <div className="track-list">{(Object.keys(tracks) as Track[]).map(track=><button className={mode === track ? 'selected' : ''} key={track} onClick={()=>selectTrack(track)}><TrackIcon track={track}/><span>{tracks[track].name}<small>{tracks[track].subtitle}</small></span><ChevronRight size={14}/></button>)}</div>
      <div className="lesson-list"><div className="lesson-list-label">{tracks[mode].name} <span>{completedInTrack}/6</span></div>{currentTrack.filter(l=>!query || l.title.toLowerCase().includes(query.toLowerCase())).map((lesson,index)=><button key={lesson.id} onClick={()=>selectLesson(lesson.id)} className={!sandbox && currentLesson.id === lesson.id ? 'current' : ''}><span className={`lesson-number ${store.completed.includes(lesson.id) ? 'done' : ''}`}>{store.completed.includes(lesson.id) ? <Check size={12}/> : String(index + 1).padStart(2,'0')}</span><span>{lesson.title}</span>{!sandbox && currentLesson.id === lesson.id && <span className="current-dot"/>}</button>)}</div>
      <div className="sidebar-bottom"><div className="progress-note"><span className="progress-symbol"><Sparkles size={19}/></span><strong>Практика решает.<small>Один урок ближе к своей идее.</small></strong><div className="progress-track"><i style={{width:`${percentage}%`}}/></div><div className="progress-text">Пройдено {store.completed.length} из 18 <b>{percentage}%</b></div></div><button className="help-button" onClick={()=>setHelp(true)}><CircleHelp size={17}/>Как здесь всё работает<ChevronRight size={14}/></button><div className="local-profile"><span>А</span><div>Моё обучение<small>Сохраняется в этом браузере</small></div><span className="online-dot"/></div></div>
    </aside>
    {sidebar && <button className="sidebar-overlay" aria-label="Закрыть меню" onClick={()=>setSidebar(false)}/>}
    <div className="main-shell">
      <header className="topbar"><button className="icon-button mobile-menu" title="Открыть меню" onClick={()=>setSidebar(true)}><Menu size={20}/></button><div className="breadcrumb"><span>Моё обучение</span><ChevronRight size={13}/><strong>{page === 'library' ? 'Все уроки' : page === 'progress' ? 'Прогресс' : sandbox ? 'Свободная песочница' : tracks[mode].name}</strong></div><div className="topbar-right"><span className="local-pill"><span/>Локально и без регистрации</span><button className="icon-button" title="Помощь" onClick={()=>setHelp(true)}><CircleHelp size={18}/></button><span className="avatar">А</span></div></header>
      {page === 'lab' ? <main className="lab-page">
        <section className="lesson-heading"><div><div className="eyebrow"><span className="eyebrow-dot"/>{sandbox ? 'МЕСТО ДЛЯ ТВОИХ ИДЕЙ' : `${tracks[mode].name.toUpperCase()} · УРОК ${String(lessonIndex+1).padStart(2,'0')} ИЗ 06`}</div><h1>{sandbox ? 'Попробуй. Измени. Создай.' : currentLesson.title}<span className="heading-accent">{sandbox ? <Sparkles size={23}/> : <Atom size={25}/>}</span></h1><p>{sandbox ? 'Чистый код, живой результат и полная свобода экспериментировать.' : currentLesson.subtitle + '. Пиши код и сразу смотри, что получается.'}</p></div><div className="heading-meta">{!sandbox && <><span><Clock3 size={14}/>{currentLesson.minutes} минут</span><span className="level-pill"><span/>{currentLesson.level}</span></>}<button className="text-button" onClick={()=>setPage('library')}>Все уроки<ArrowRight size={15}/></button></div></section>
        <div className="workspace-toolbar"><div className="workspace-mode"><span>{sandbox ? 'СРЕДА' : 'ПРАКТИКА'}</span><div className="mode-tabs" aria-label="Язык песочницы">{(Object.keys(tracks) as Track[]).map(track=><button key={track} className={mode === track ? 'active' : ''} onClick={()=>selectTrack(track)}><TrackIcon track={track}/>{tracks[track].name}</button>)}</div></div><div className="workspace-options"><span className={`save-status ${storageError ? 'save-error' : ''}`}>{storageError ? <X size={13}/> : <CheckCircle2 size={13}/>} {storageError ? 'Не удалось сохранить' : saved ? 'Сохранено' : 'Сохраняем…'}</span><button className={`auto-toggle ${store.auto ? 'on' : ''}`} role="switch" aria-checked={store.auto} onClick={()=>setStore(current=>({...current,auto:!current.auto}))}><i/>Автозапуск</button><button className="icon-button" title={focus ? 'Выйти из режима фокуса' : 'Режим фокуса'} onClick={()=>setFocus(!focus)}><Expand size={16}/></button></div></div>
        <div className={`workspace ${sandbox ? 'sandbox-workspace' : ''}`}>
          {!sandbox && <section className="lesson-panel"><div className="lesson-tabs" role="tablist"><button role="tab" aria-selected={lessonTab === 'theory'} className={lessonTab === 'theory' ? 'active' : ''} onClick={()=>setLessonTab('theory')}><BookOpen size={14}/>Теория</button><button role="tab" aria-selected={lessonTab === 'task'} className={lessonTab === 'task' ? 'active' : ''} onClick={()=>setLessonTab('task')}><Code2 size={14}/>Задание<span>1</span></button></div><div className="lesson-content">{lessonTab === 'theory' ? <><span className="section-kicker">РАЗБЕРЁМСЯ ВМЕСТЕ</span><h2>{mode === 'react' && currentLesson.id === 'react-state' ? 'Интерфейс, который\nреагирует на тебя.' : currentLesson.subtitle}</h2>{currentLesson.theory.map((paragraph,index)=><p key={index}>{paragraph}</p>)}<div className="theory-example"><span><Code2 size={13}/>Короткий пример</span><pre>{currentLesson.example}</pre></div><a href={currentLesson.source} target="_blank" rel="noreferrer" className="docs-link">Читать документацию<ExternalLink size={13}/></a></> : <><span className="section-kicker">ТВОЯ МАЛЕНЬКАЯ ЗАДАЧА</span><h2>Теперь твоя очередь.</h2><p>{currentLesson.task}</p><div className="checklist">{currentLesson.checks.map((check,index)=><div key={index}><span className={checkResults?.[index]?.passed ? 'passed' : ''}>{checkResults?.[index]?.passed ? <Check size={12}/> : index+1}</span>{check.label}</div>)}</div>{checkResults && <div className={`check-result ${checkResults.every(c=>c.passed) ? 'success' : 'retry'}`} role="status"><strong>{checkResults.every(c=>c.passed) ? 'Получилось! Урок пройден.' : 'Почти! Проверь условия задания.'}</strong>{checkResults.map((result,index)=><span key={index}>{result.passed ? '✓' : '○'} {result.label}{result.error && <small>{result.error}</small>}</span>)}</div>}<button className="hint-link" onClick={()=>setHint(!hint)}><Lightbulb size={15}/>{hint ? 'Скрыть подсказку' : 'Нужна подсказка?'}<ChevronDown size={14}/></button>{hint && <p className="hint-text">{currentLesson.hint}</p>}<button className="solution-link" onClick={()=>setSolution(true)}>Посмотреть решение<ArrowRight size={13}/></button></> }</div><div className="lesson-panel-bottom"><div className="tip"><Lightbulb size={17}/><p>Лучше всего учиться,<br/><strong>меняя код своими руками.</strong></p></div><button className="check-button" disabled={checking} onClick={()=>{setLessonTab('task');run(true);}}>{checking ? 'Проверяем…' : 'Проверить решение'}<CheckCircle2 size={16}/></button></div></section>}
          <section className="editor-panel"><div className="editor-file-tabs"><div>{(['code','css','html'] as const).map(kind=><button className={file === kind ? 'active' : ''} key={kind} onClick={()=>setFile(kind)}>{kind === 'code' ? <span className="file-type">{mode === 'react' ? <Atom size={13}/> : mode.toUpperCase()}</span> : <span className={`file-type ${kind}`}>{kind === 'css' ? '#' : '◇'}</span>}{kind === 'code' ? mode === 'react' ? 'App.tsx' : `main.${mode}` : kind === 'css' ? 'styles.css' : 'index.html'}</button>)}</div><button className="editor-icon" title="Скачать текущий файл" onClick={()=>download(filename,draft[file])}><ArrowDownToLine size={15}/></button></div><Editor key={draftKey+file} value={draft[file]} onChange={edit} language={file === 'code' ? mode : file} onRun={()=>run()}/><div className="editor-actions"><div><button className="editor-icon" title="Сбросить пример" onClick={reset}><RotateCcw size={15}/></button><span>{filename}<i/>UTF-8</span></div><button className="run-button" onClick={()=>run()}><Play size={13} fill="currentColor"/>Запустить<kbd>⌘ ↵</kbd></button></div></section>
          <section className="result-panel"><div className="result-header"><strong><Monitor size={15}/>Результат <span className={`run-status ${status}`}><i/>{status === 'ready' ? 'Live' : status === 'compiling' ? 'Запуск…' : status === 'error' ? 'Ошибка' : 'Стоп'}</span></strong><div className="preview-controls"><button className={!mobilePreview ? 'active' : ''} title="Широкий экран" onClick={()=>setMobilePreview(false)}><Monitor size={14}/></button><button className={mobilePreview ? 'active' : ''} title="Мобильный экран" onClick={()=>setMobilePreview(true)}><Smartphone size={14}/></button><button title="Остановить выполнение" onClick={stop}><Square size={12}/></button></div></div><div className="preview-address"><span className="browser-dots"><i/><i/><i/></span><span><span className="address-lock">◇</span>preview / {mode === 'react' ? 'my-first-app' : tracks[mode].name.toLowerCase()}</span><button title="Обновить результат" onClick={()=>run()}><RotateCcw size={12}/></button></div><div ref={canvas} className={`preview-canvas ${mobilePreview ? 'mobile-preview' : ''}`}>{preview ? <iframe ref={frame} title="Живой результат кода" width={frameSize.width} height={frameSize.height} style={{width:frameSize.width, height:frameSize.height}} sandbox="allow-scripts" srcDoc={preview}/> : <div className="preview-placeholder">{status === 'error' ? <><Code2 size={28}/><strong>Код просит внимания</strong><span>Подробности ошибки — внизу.</span></> : status === 'stopped' ? <><Square size={25}/><strong>Выполнение остановлено</strong><span>Нажми «Запустить», когда будешь готов.</span></> : <><Atom size={31} className="spinning"/><strong>Готовим твой результат…</strong><span>Компилятор запускается в браузере.</span></>}</div>}</div><div className="console-panel"><div className="console-header"><div><button className={outputTab === 'console' ? 'active' : ''} onClick={()=>setOutputTab('console')}><Terminal size={13}/>Консоль<span>{logs.length}</span></button><button className={outputTab === 'problems' ? 'active' : ''} onClick={()=>setOutputTab('problems')}>Ошибки{diagnostics.length > 0 && <span className="error-count">{diagnostics.length}</span>}</button></div><button title="Очистить консоль" onClick={()=>setLogs([])}><RotateCcw size={12}/></button></div><div className="console-output" role="log" aria-live="polite">{outputTab === 'console' ? logs.length ? logs.map((log,index)=><div key={index} className={`console-line ${log.level}`}><ChevronRight size={12}/><pre>{log.text}</pre></div>) : <div className="empty-console"><span>›</span><p>Здесь появится вывод <code>console.log()</code><small>Все эксперименты выполняются в твоём браузере.</small></p></div> : diagnostics.length ? diagnostics.map((diagnostic,index)=><div className="diagnostic" key={index}>{diagnostic.line && <strong>Строка {diagnostic.line}:{diagnostic.column}</strong>}<pre>{diagnostic.message}</pre></div>) : <div className="no-errors"><CheckCircle2 size={15}/>Ошибок компиляции нет</div>}</div></div></section>
        </div>
        <footer className="lab-footer"><span><span className="footer-dot"/>Твой код. Твой темп. Твой результат.</span>{sandbox ? <span>Подключены React 19 и TypeScript 5.9</span> : <div><button disabled={lessonIndex === 0} onClick={()=>selectLesson(currentTrack[lessonIndex-1].id)}><ArrowLeft size={14}/>Предыдущий</button><span>{lessonIndex+1} / 6</span><button disabled={!nextLesson} onClick={()=>nextLesson && selectLesson(nextLesson.id)}>Следующий урок<ArrowRight size={14}/></button></div>}</footer>
      </main> : page === 'library' ? <main className="library-page"><div className="eyebrow"><span className="eyebrow-dot"/>ОТ ОСНОВ К СВОЕМУ ПРИЛОЖЕНИЮ</div><h1>Меньше «понятно».<br/>Больше «получилось».</h1><p className="page-lead">18 небольших уроков, которые превращают теорию в работающий код.<br/>Начни с JavaScript или выбери тему, которую хочешь разобрать.</p><div className="library-tools"><span><BookOpen size={17}/>Все учебные треки</span><label className="search-box"><Search size={15}/><input placeholder="Найти урок…" value={query} onChange={event=>setQuery(event.target.value)}/>{query && <button aria-label="Очистить поиск" onClick={()=>setQuery('')}><X size={14}/></button>}</label></div><div className="course-grid">{(Object.keys(tracks) as Track[]).map(track=><section className="course-card" key={track}><div className="course-card-top"><TrackIcon track={track} size="large"/><span>0{track === 'js' ? 1 : track === 'ts' ? 2 : 3}</span></div><h2>{tracks[track].name}</h2><p>{tracks[track].description}</p><span className="course-duration">6 уроков · {lessons.filter(l=>l.track === track).reduce((sum,l)=>sum+l.minutes,0)} минут</span><div className="course-lessons">{lessons.filter(l=>l.track === track && l.title.toLowerCase().includes(query.toLowerCase())).map((lesson,index)=><button key={lesson.id} onClick={()=>selectLesson(lesson.id)}><span>{store.completed.includes(lesson.id) ? <CheckCircle2 size={14}/> : String(index+1).padStart(2,'0')}</span><strong>{lesson.title}<small>{lesson.minutes} минут · {lesson.level}</small></strong><ArrowRight size={14}/></button>)}</div><button className="course-start" onClick={()=>selectLesson(lessons.find(l=>l.track===track && !store.completed.includes(l.id))?.id ?? lessons.find(l=>l.track===track)!.id)}>Продолжить трек<ArrowRight size={15}/></button></section>)}</div>{query && !lessons.some(l=>l.title.toLowerCase().includes(query.toLowerCase())) && <p className="search-empty">Ничего не найдено. Попробуй «типы», «формы» или «массивы».</p>}<div className="sandbox-banner"><span className="sandbox-banner-icon"><FlaskConical size={32}/></span><div><h2>Есть своя идея? Дай ей место.</h2><p>Свободная песочница для JS, TS и React. Без заданий, с живым результатом.</p></div><button onClick={()=>enterSandbox('react')}>Открыть песочницу<ArrowRight size={16}/></button></div></main> : <main className="progress-page"><div className="eyebrow"><span className="eyebrow-dot"/>ТВОЙ ПУТЬ В РАЗРАБОТКЕ</div><h1>Каждый шаг считается.</h1><p className="page-lead">Прогресс отмечается после успешной проверки задания.<br/>Код и пройденные уроки сохраняются в этом браузере.</p><div className="stats-grid"><div><BookOpen size={23}/><strong>{store.completed.length}<small>/ 18</small></strong><span>уроков пройдено</span></div><div><Trophy size={23}/><strong>{percentage}<small>%</small></strong><span>учебного пути позади</span></div><div><Clock3 size={23}/><strong>{lessons.filter(l=>store.completed.includes(l.id)).reduce((sum,l)=>sum+l.minutes,0)}<small>мин</small></strong><span>материала освоено</span></div></div><div className="progress-tracks">{(Object.keys(tracks) as Track[]).map(track=>{ const done = lessons.filter(l=>l.track === track && store.completed.includes(l.id)); return <div key={track}><TrackIcon track={track} size="large"/><div><h2>{tracks[track].name}<span>{done.length} из 6</span></h2><div className="progress-track"><i style={{width:`${done.length/6*100}%`}}/></div><p>{done.length ? done.map(l=>l.title).join(' · ') : 'Первый шаг ещё впереди. Начни с любого урока.'}</p></div><button onClick={()=>selectLesson(lessons.find(l=>l.track === track && !store.completed.includes(l.id))?.id ?? lessons.find(l=>l.track === track)!.id)}>{done.length ? 'Продолжить' : 'Начать'}<ArrowRight size={16}/></button></div>;})}</div><button className="backup-button" onClick={()=>download('frontend-lab-backup.json',JSON.stringify(store,null,2),'application/json')}><ArrowDownToLine size={16}/>Скачать резервную копию кода и прогресса</button><label className="backup-button restore-button"><ArrowRight size={16}/>Восстановить из копии<input type="file" accept="application/json,.json" onChange={async event=>{ const input=event.currentTarget; const uploaded=input.files?.[0]; if(!uploaded)return; try { const value=JSON.parse(await uploaded.text()); if(value.version!==1 || !Array.isArray(value.completed) || !value.drafts || Object.values(value.drafts).some(d=>{ const v=d as Draft; return !v || typeof v.code!=='string' || typeof v.css!=='string' || typeof v.html!=='string'; }))throw new Error('Некорректная копия'); if(window.confirm('Восстановить код и прогресс из этой копии? Текущие данные будут заменены.')) { localStorage.setItem(storageKey,JSON.stringify(value));setStore(readStore()); } } catch {window.alert('Не удалось прочитать копию. Выбери JSON, скачанный из Frontend Lab.');} input.value='';}}/></label></main>}
    </div>
    {(help || solution) && <div className="modal-backdrop" onClick={()=>{setHelp(false);setSolution(false);}}><section className="modal" role="dialog" aria-modal="true" aria-label={solution ? 'Решение задания' : 'Как пользоваться'} onClick={event=>event.stopPropagation()}><button className="modal-close icon-button" aria-label="Закрыть" autoFocus onClick={()=>{setHelp(false);setSolution(false);}}><X size={20}/></button>{solution ? <><span className="section-kicker">ОДИН ИЗ ВАРИАНТОВ</span><h2>Разбери, затем повтори.</h2><p>Сравни решение со своим кодом. Прогресс засчитывается только после проверки.</p><pre className="solution-code">{currentLesson.solution}</pre><button className="check-button" onClick={()=>{setStore(current=>({...current,drafts:{...current.drafts,[draftKey]:{...draft,code:currentLesson.solution}}}));setSolution(false);}}>Открыть решение в редакторе<ArrowRight size={16}/></button></> : <><span className="section-kicker">ДОБРО ПОЖАЛОВАТЬ В ЛАБОРАТОРИЮ</span><h2>Учись через маленькие эксперименты.</h2><ol className="help-steps"><li><strong>Выбери урок или песочницу.</strong><p>Уроки дают объяснение, задачу, подсказку и проверку. Песочница — пространство для своих идей.</p></li><li><strong>Пиши код в редакторе.</strong><p>Есть отдельные вкладки для кода, CSS и HTML. React использует App.tsx с компонентом по умолчанию. Доступны react и react-dom/client; внешние пакеты и сетевые запросы здесь не подключены.</p></li><li><strong>Смотри на результат.</strong><p>Автозапуск обновляет пример через 650 мс после ввода. Можно запускать вручную кнопкой или сочетанием Ctrl / ⌘ + Enter. При запуске состояние примера сбрасывается.</p></li><li><strong>Проверь решение.</strong><p>Успешные проверки отмечают урок пройденным. Типовые ошибки TypeScript видны во вкладке «Ошибки», вывод console.log — в консоли.</p></li></ol><div className="help-storage"><CheckCircle2 size={18}/><p>Код и прогресс хранятся локально. В «Мой прогресс» можно скачать и восстановить резервную копию.</p></div></>}</section></div>}
  </div>;
}
