/* ============================================================
   Study Tracker — App shell: reducer, header, nav, routing
   ============================================================ */

const STORAGE_KEY = 'studytracker.v1';

function loadState() {
  try { const raw = localStorage.getItem(STORAGE_KEY); if (raw) return JSON.parse(raw); } catch (e) {}
  return JSON.parse(JSON.stringify(STData));
}

function reducer(state, action) {
  const s = JSON.parse(JSON.stringify(state));
  const sem = (id) => s.semesters.find(x => x.id === id);
  const course = (semId, cId) => sem(semId)?.courses.find(c => c.id === cId);
  switch (action.type) {
    case 'toggleSem': { const x = sem(action.semId); if (x) x.expanded = !x.expanded; break; }
    case 'toggleCourse': { const c = course(action.semId, action.courseId); if (c) c.expanded = !c.expanded; break; }
    case 'addSem': s.semesters.unshift({ id: ST.uid('sem'), name: action.name, expanded: true, courses: [], exams: [] }); break;
    case 'removeSem': s.semesters = s.semesters.filter(x => x.id !== action.semId); break;
    case 'addCourse': { const x = sem(action.semId); if (x) x.courses.push({ id: ST.uid('c'), ...action.course, expanded: true, tasks: [] }); break; }
    case 'removeCourse': { const x = sem(action.semId); if (x) x.courses = x.courses.filter(c => c.id !== action.courseId); break; }
    case 'addTask': { const c = course(action.semId, action.courseId); if (c) c.tasks.push({ id: ST.uid('t'), ...action.task }); break; }
    case 'removeTask': { const c = course(action.semId, action.courseId); if (c) c.tasks = c.tasks.filter(t => t.id !== action.taskId); break; }
    case 'progress': { const c = course(action.semId, action.courseId); const t = c?.tasks.find(t => t.id === action.taskId); if (t) t.done = Math.max(0, Math.min(t.total, t.done + action.delta)); break; }
    case 'addExam': { const x = sem(action.semId); if (x) { x.exams = x.exams || []; x.exams.push({ id: ST.uid('e'), ...action.exam }); } break; }
    case 'removeExam': { const x = sem(action.semId); if (x) x.exams = (x.exams || []).filter(e => e.id !== action.examId); break; }
    case 'addSession': s.sessions.push(action.session); break;
    case 'reset': return JSON.parse(JSON.stringify(STData));
    default: break;
  }
  return s;
}

/* ---------- Overall score widget ---------- */
function ScoreBadge({ data }) {
  const score = ST.overallScore(data);
  const st = ST.scoreState(score);
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '7px 8px 7px 14px', borderRadius: 'var(--r-pill)', background: 'var(--surface)', border: '1px solid var(--line)' }}>
      <div>
        <div className="eyebrow" style={{ fontSize: 8.5, marginBottom: 1 }}>Overall score</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
          <span style={{ width: 7, height: 7, borderRadius: 99, background: st.color }} />
          <span style={{ fontSize: 12.5, fontWeight: 700, color: st.color }}>{st.label}</span>
        </div>
      </div>
      <Ring value={score} size={42} stroke={5} color={st.color}>
        <span className="mono" style={{ fontSize: 14, fontWeight: 700 }}>{score}</span>
      </Ring>
    </div>
  );
}

/* ---------- Header ---------- */
function Header({ data, theme, setTheme, onBackup }) {
  return (
    <header style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16, padding: '16px 28px', borderBottom: '1px solid var(--line)', background: 'color-mix(in oklch, var(--bg) 80%, transparent)', backdropFilter: 'blur(12px)', position: 'sticky', top: 0, zIndex: 50 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
        <div style={{ width: 38, height: 38, borderRadius: 11, background: 'linear-gradient(145deg, var(--accent), var(--accent-strong))', display: 'grid', placeItems: 'center', color: 'oklch(0.18 0.02 250)', boxShadow: 'var(--shadow-md)' }}>
          <Icon name="leaf" size={21} />
        </div>
        <div>
          <div className="serif" style={{ fontSize: 18, fontWeight: 600, letterSpacing: '-0.01em', lineHeight: 1.1 }}>Study Tracker</div>
          <div style={{ fontSize: 11, color: 'var(--ink-4)', marginTop: 1 }}>Semester planning, focus tracking, workload clarity, and study notes.</div>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <ScoreBadge data={data} />
        <Btn variant="solid" size="md" icon="download" onClick={onBackup}>Backup JSON</Btn>
        <button onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')} title="Toggle theme" style={{ width: 38, height: 38, borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)', color: 'var(--ink-2)', display: 'grid', placeItems: 'center', cursor: 'pointer' }}>
          <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={18} />
        </button>
      </div>
    </header>
  );
}

/* ---------- Nav ---------- */
const NAV = [
  { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
  { id: 'planner', label: 'Planner', icon: 'planner' },
  { id: 'timer', label: 'Timer', icon: 'timer' },
  { id: 'vault', label: 'Vault + AI', icon: 'vault' },
];
function Nav({ tab, setTab }) {
  return (
    <nav style={{ display: 'flex', gap: 4, padding: '0 28px', borderBottom: '1px solid var(--line)', background: 'color-mix(in oklch, var(--bg) 80%, transparent)', position: 'sticky', top: 71, zIndex: 49, backdropFilter: 'blur(12px)' }}>
      {NAV.map(n => {
        const active = tab === n.id;
        return (
          <button key={n.id} onClick={() => setTab(n.id)} style={{
            display: 'inline-flex', alignItems: 'center', gap: 8, padding: '14px 16px 13px',
            background: 'none', border: 'none', borderBottom: '2px solid', borderColor: active ? 'var(--accent)' : 'transparent',
            color: active ? 'var(--ink)' : 'var(--ink-4)', fontSize: 13.5, fontWeight: 600, cursor: 'pointer',
            fontFamily: 'var(--font-sans)', transition: 'all .15s', marginBottom: -1,
          }}>
            <Icon name={n.icon} size={17} />{n.label}
          </button>
        );
      })}
    </nav>
  );
}

/* ---------- Toast ---------- */
function Toast({ msg }) {
  if (!msg) return null;
  return (
    <div style={{ position: 'fixed', bottom: 24, left: '50%', transform: 'translateX(-50%)', zIndex: 100,
      padding: '12px 20px', borderRadius: 'var(--r-pill)', background: 'var(--ink)', color: 'var(--bg)',
      fontSize: 13, fontWeight: 600, boxShadow: 'var(--shadow-lg)', display: 'flex', alignItems: 'center', gap: 8 }} className="fade-up">
      <Icon name="check" size={16} />{msg}
    </div>
  );
}

/* ---------- App ---------- */
function App() {
  const [state, dispatch] = React.useReducer(reducer, null, loadState);
  const [tab, setTab] = useState('dashboard');
  const [dashDir, setDashDir] = useState('cockpit');
  const [theme, setTheme] = useState(() => localStorage.getItem('studytracker.theme') || 'dark');
  const [linkedTaskId, setLinkedTaskId] = useState(state.selectedTaskId || null);
  const [selectedTaskId, setSelectedTaskId] = useState(state.selectedTaskId || null);
  const [toast, setToast] = useState('');

  useEffect(() => { document.documentElement.setAttribute('data-theme', theme); localStorage.setItem('studytracker.theme', theme); }, [theme]);
  useEffect(() => { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) {} }, [state]);

  const showToast = (m) => { setToast(m); setTimeout(() => setToast(''), 2200); };

  const focusTask = (task) => { setLinkedTaskId(task.id); setSelectedTaskId(task.id); setTab('timer'); showToast(`“${task.title}” sent to timer`); };
  const backup = () => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob); const a = document.createElement('a');
    a.href = url; a.download = `studytracker-backup-${ST.iso(ST.today)}.json`; a.click(); URL.revokeObjectURL(url);
    showToast('Backup downloaded');
  };

  return (
    <div style={{ minHeight: '100vh' }}>
      <Header data={state} theme={theme} setTheme={setTheme} onBackup={backup} />
      <Nav tab={tab} setTab={setTab} />
      <main style={{ maxWidth: 1340, margin: '0 auto', padding: '26px 28px 80px' }}>
        {tab === 'dashboard' && <Dashboard data={state} onFocus={focusTask} selectedTaskId={selectedTaskId} onSelectTask={setSelectedTaskId} dir={dashDir} setDir={setDashDir} />}
        {tab === 'planner' && <Planner data={state} dispatch={dispatch} onFocus={focusTask} selectedTaskId={selectedTaskId} />}
        {tab === 'timer' && <Timer data={state} dispatch={(a) => { dispatch(a); if (a.type === 'addSession') showToast('Session saved'); }} linkedTaskId={linkedTaskId} setLinkedTaskId={setLinkedTaskId} />}
        {tab === 'vault' && <VaultAI data={state} dispatch={dispatch} />}
      </main>
      <Toast msg={toast} />
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
