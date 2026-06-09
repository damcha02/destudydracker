/* ============================================================
   Timer — simple distraction-free face + progressive advanced
   Presets: Pomodoro / Deep Work / Sprint / Exam / Custom
   ============================================================ */

const PRESETS = {
  'Pomodoro':  { focus: 25, brk: 5,  phase: 'study', desc: '25 / 5' },
  'Deep Work': { focus: 52, brk: 17, phase: 'study', desc: '52 / 17' },
  'Sprint':    { focus: 90, brk: 20, phase: 'study', desc: '90 / 20' },
  'Exam':      { focus: 120, brk: 0, phase: 'exam',  desc: '120 min' },
  'Custom':    { focus: 30, brk: 8,  phase: 'study', desc: 'Custom' },
};

function RecentSession({ s, data }) {
  const course = ST.courseById(data, s.courseId);
  return (
    <div style={{ display: 'flex', gap: 12, padding: '12px 0', borderBottom: '1px solid var(--line-soft)' }}>
      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 99, background: s.phase === 'exam' ? 'var(--warn)' : course ? ST.color(course.color) : 'var(--accent)' }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
          <span style={{ fontSize: 13, fontWeight: 600 }}>{s.goal || s.preset}</span>
          <Chip size="sm">{s.preset}</Chip>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: s.learned ? 5 : 0 }}>
          {course && <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', display: 'inline-flex', alignItems: 'center', gap: 4 }}><Dot color={course.color} size={5} />{course.name}</span>}
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{ST.fmtMins(s.minutes)}</span>
          <span className="mono" style={{ fontSize: 10, color: 'var(--ink-4)' }}>{ST.fmtTime(s.start)}</span>
        </div>
        {s.learned && <div style={{ fontSize: 11.5, color: 'var(--ink-3)', lineHeight: 1.5 }}>{s.learned}</div>}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 2 }}>
        {Array.from({ length: 5 }).map((_, i) => (
          <span key={i} style={{ width: 5, height: 5, borderRadius: 99, marginTop: 4, background: i < s.confidence ? 'var(--accent)' : 'var(--line)' }} />
        ))}
      </div>
    </div>
  );
}

function Timer({ data, dispatch, linkedTaskId, setLinkedTaskId }) {
  const [preset, setPreset] = useState('Deep Work');
  const [showAdv, setShowAdv] = useState(false);
  const cfg = PRESETS[preset];
  const linkedTask = ST.taskById(data, linkedTaskId);

  const [focusMin, setFocusMin] = useState(cfg.focus);
  const [breakMin, setBreakMin] = useState(cfg.brk);
  const [phase, setPhase] = useState(cfg.phase); // study | break | exam
  const [secondsLeft, setSecondsLeft] = useState(cfg.focus * 60);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);

  // logging fields
  const [semId, setSemId] = useState(linkedTask ? linkedTask.semId : 'sem-fs26');
  const [courseId, setCourseId] = useState(linkedTask ? linkedTask.courseId : '');
  const [goal, setGoal] = useState('');
  const [learned, setLearned] = useState('');
  const [blocker, setBlocker] = useState('');
  const [next, setNext] = useState('');
  const [confidence, setConfidence] = useState(3);

  // apply preset
  useEffect(() => {
    const c = PRESETS[preset];
    setFocusMin(c.focus); setBreakMin(c.brk); setPhase(c.phase);
    setSecondsLeft(c.focus * 60); setRunning(false); setElapsed(0);
  }, [preset]);

  // sync linked task
  useEffect(() => {
    if (linkedTask) { setCourseId(linkedTask.courseId); setSemId(linkedTask.semId); if (!goal) setGoal(linkedTask.title); }
  }, [linkedTaskId]);

  // tick
  useEffect(() => {
    if (!running) return;
    const id = setInterval(() => {
      setSecondsLeft(s => { if (s <= 1) { setRunning(false); return 0; } return s - 1; });
      setElapsed(e => e + 1);
    }, 1000);
    return () => clearInterval(id);
  }, [running]);

  const totalSec = (phase === 'break' ? breakMin : focusMin) * 60;
  const pctDone = totalSec ? ((totalSec - secondsLeft) / totalSec) * 100 : 0;
  const mm = String(Math.floor(secondsLeft / 60)).padStart(2, '0');
  const ss = String(secondsLeft % 60).padStart(2, '0');

  const phaseColor = phase === 'exam' ? 'var(--warn)' : phase === 'break' ? 'var(--ok)' : 'var(--accent)';
  const phaseLabel = phase === 'exam' ? 'Exam' : phase === 'break' ? 'Break' : 'Study';
  const course = ST.courseById(data, courseId);

  const saveSession = () => {
    const mins = Math.max(1, Math.round(elapsed / 60));
    dispatch({ type: 'addSession', session: {
      id: ST.uid('s'), preset, phase, semId, courseId: courseId || null, taskId: linkedTaskId || null,
      goal, learned, blocker, next, confidence, minutes: mins,
      start: ST.iso(ST.today) + 'T' + new Date().toTimeString().slice(0, 5),
      end: ST.iso(ST.today) + 'T' + new Date().toTimeString().slice(0, 5),
    }});
    setElapsed(0); setSecondsLeft(focusMin * 60); setRunning(false); setLearned(''); setBlocker(''); setNext('');
  };
  const reset = () => { setRunning(false); setSecondsLeft((phase === 'break' ? breakMin : focusMin) * 60); setElapsed(0); };

  return (
    <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 360px', gap: 18, alignItems: 'start' }}>
      {/* main face */}
      <div className="timer-main" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div>
          <h1 className="serif" style={{ fontSize: 27, fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>Focus timer</h1>
          <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--ink-3)' }}>Pick a rhythm, press start, and let the rest fade away.</p>
        </div>

        <Card raised pad={0} style={{ overflow: 'hidden' }}>
          {/* preset selector */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--line)', display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {Object.entries(PRESETS).map(([k, v]) => (
              <button key={k} onClick={() => setPreset(k)} style={{
                display: 'flex', flexDirection: 'column', alignItems: 'flex-start', gap: 2, padding: '8px 14px',
                borderRadius: 'var(--r-md)', cursor: 'pointer', transition: 'all .15s', minWidth: 84,
                background: preset === k ? 'var(--accent-soft)' : 'var(--surface-inset)',
                border: '1px solid', borderColor: preset === k ? 'var(--accent-line)' : 'var(--line-soft)',
              }}>
                <span style={{ fontSize: 12.5, fontWeight: 600, color: preset === k ? 'var(--accent)' : 'var(--ink)' }}>{k}</span>
                <span className="mono" style={{ fontSize: 9.5, color: 'var(--ink-4)' }}>{v.desc}</span>
              </button>
            ))}
          </div>

          {/* big face */}
          <div style={{ padding: '40px 20px 32px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 22,
            background: `radial-gradient(420px 220px at 50% -10%, ${phaseColor === 'var(--accent)' ? 'var(--accent-soft)' : phase === 'break' ? 'var(--garden-soft)' : 'var(--warn-soft)'}, transparent 70%)` }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Chip color={phaseColor} bg="transparent" style={{ borderColor: phaseColor, fontSize: 11 }}>{phaseLabel}</Chip>
              <span style={{ fontSize: 12.5, color: 'var(--ink-3)', display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                {course ? <><Dot color={course.color} size={7} />{course.name}</> : 'General focus'}
              </span>
            </div>

            <div style={{ position: 'relative' }}>
              <Ring value={pctDone} size={252} stroke={6} color={phaseColor} track="var(--ring-track)">
                <span className="mono" style={{ fontSize: 72, fontWeight: 500, letterSpacing: '-0.03em', lineHeight: 1, color: 'var(--ink)' }}>{mm}:{ss}</span>
                <span className="eyebrow" style={{ marginTop: 8 }}>{running ? 'In session' : elapsed > 0 ? 'Paused' : 'Ready'} · {ST.fmtMins(Math.round(elapsed / 60))} logged</span>
              </Ring>
            </div>

            <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
              <Btn size="lg" variant="primary" icon={running ? 'pause' : 'play'} onClick={() => setRunning(r => !r)} style={{ minWidth: 150 }}>
                {running ? 'Pause' : elapsed > 0 ? 'Resume' : 'Start'}
              </Btn>
              <Btn size="lg" variant="solid" icon="save" onClick={saveSession} title="Save session now">Save</Btn>
              <Btn size="lg" variant="ghost" icon="reset" onClick={reset} title="Reset" />
            </div>

            {phase !== 'exam' && (
              <button onClick={() => { setPhase(p => p === 'study' ? 'break' : 'study'); setRunning(false); setTimeout(() => setSecondsLeft((phase === 'study' ? breakMin : focusMin) * 60), 0); }}
                style={{ background: 'none', border: 'none', color: 'var(--ink-4)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--font-sans)' }}>
                Switch to {phase === 'study' ? 'break' : 'study'} →
              </button>
            )}
          </div>
        </Card>

        {/* advanced toggle */}
        <Card pad={0} style={{ overflow: 'hidden' }}>
          <button onClick={() => setShowAdv(a => !a)} style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '15px 20px', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--ink)' }}>
            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 10 }}>
              <Icon name="edit" size={16} style={{ color: 'var(--ink-3)' }} />
              <span style={{ fontSize: 14, fontWeight: 600 }}>Session log & links</span>
              <Chip size="sm">optional</Chip>
            </span>
            <Icon name={showAdv ? 'chevronDown' : 'chevron'} size={16} style={{ color: 'var(--ink-4)' }} />
          </button>
          {showAdv && (
            <div style={{ padding: '4px 20px 20px', display: 'flex', flexDirection: 'column', gap: 14 }} className="fade-up">
              <hr className="hairline" />
              <div className="eyebrow">Link this session</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px,1fr))', gap: 12 }}>
                <Field label="Semester"><select value={semId} onChange={e => { setSemId(e.target.value); setCourseId(''); }} style={inputStyle}>{data.semesters.map(s => <option key={s.id} value={s.id}>{s.name}</option>)}</select></Field>
                <Field label="Course"><select value={courseId} onChange={e => setCourseId(e.target.value)} style={inputStyle}><option value="">— None —</option>{(data.semesters.find(s => s.id === semId)?.courses || []).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
                <Field label="Task"><select value={linkedTaskId || ''} onChange={e => setLinkedTaskId(e.target.value || null)} style={inputStyle}><option value="">— None —</option>{ST.allTasks(data).filter(t => t.semId === semId && (!courseId || t.courseId === courseId)).map(t => <option key={t.id} value={t.id}>{t.title}</option>)}</select></Field>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="Focus minutes"><Input type="number" min="1" value={focusMin} onChange={e => { const v = +e.target.value || 1; setFocusMin(v); if (phase !== 'break' && !running) setSecondsLeft(v * 60); }} /></Field>
                <Field label="Break minutes"><Input type="number" min="0" value={breakMin} disabled={phase === 'exam'} onChange={e => setBreakMin(+e.target.value || 0)} style={{ opacity: phase === 'exam' ? 0.5 : 1 }} /></Field>
              </div>
              <Field label="Goal for this block"><Input value={goal} placeholder="What will you accomplish?" onChange={e => setGoal(e.target.value)} /></Field>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <Field label="What did you learn?"><Textarea value={learned} onChange={e => setLearned(e.target.value)} placeholder="Key takeaways…" /></Field>
                <Field label="What's still weak / blocker?"><Textarea value={blocker} onChange={e => setBlocker(e.target.value)} placeholder="Sticking points…" /></Field>
              </div>
              <Field label="Next step"><Input value={next} onChange={e => setNext(e.target.value)} placeholder="Where to pick up next time…" /></Field>
              <Field label={`Confidence · ${confidence}/5`}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <input type="range" min="1" max="5" value={confidence} onChange={e => setConfidence(+e.target.value)} style={{ flex: 1, accentColor: 'var(--accent)' }} />
                  <div style={{ display: 'flex', gap: 4 }}>{Array.from({ length: 5 }).map((_, i) => <span key={i} style={{ width: 8, height: 8, borderRadius: 99, background: i < confidence ? 'var(--accent)' : 'var(--line)' }} />)}</div>
                </div>
              </Field>
              <Btn variant="primary" icon="save" onClick={saveSession} full>Save session</Btn>
            </div>
          )}
        </Card>
      </div>

      {/* recent sessions rail */}
      <div className="timer-rail" style={{ position: 'sticky', top: 0 }}>
        <Card>
          <CardHead eyebrow="Recent sessions" icon="clock" title="Your focus log" right={<Chip>{data.sessions.length}</Chip>} />
          {data.sessions.length === 0
            ? <Empty icon="clock" title="No sessions yet" sub="Your saved focus blocks will appear here." />
            : <div style={{ maxHeight: 560, overflowY: 'auto' }}>{data.sessions.slice().reverse().map(s => <RecentSession key={s.id} s={s} data={data} />)}</div>}
        </Card>
      </div>
    </div>
  );
}

Object.assign(window, { PRESETS, Timer, RecentSession });
