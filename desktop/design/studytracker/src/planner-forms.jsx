/* ============================================================
   Planner — part 1: forms + task/course/semester blocks
   ============================================================ */

const PALETTE = ['blue', 'violet', 'teal', 'amber', 'rose', 'green', 'cyan', 'plum'];
const miniBtn = { width: 24, height: 21, display: 'grid', placeItems: 'center', borderRadius: 6, border: '1px solid var(--line)', background: 'var(--surface-2)', color: 'var(--ink-2)', cursor: 'pointer', transition: 'all .12s' };

function TaskRow({ task, course, onFocus, onProgress, onRemove }) {
  const pct = ST.taskPct(task);
  const upd = ST.unitsPerDay(task);
  const overdue = ST.isOverdue(task);
  const done = task.done >= task.total;
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 14px', borderRadius: 'var(--r-md)',
      background: 'var(--surface-inset)', border: '1px solid var(--line-soft)' }}>
      <div style={{ width: 3, alignSelf: 'stretch', borderRadius: 99, background: done ? 'var(--ok)' : ST.color(course.color), opacity: done ? 0.7 : 1 }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
          <span style={{ fontSize: 13.5, fontWeight: 600, textDecoration: done ? 'line-through' : 'none', color: done ? 'var(--ink-3)' : 'var(--ink)' }}>{task.title}</span>
          <PriorityTag p={task.priority} />
          {done && <Chip size="sm" color="var(--ok)" bg="var(--garden-soft)" icon="check" style={{ borderColor: 'transparent' }}>Done</Chip>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 11, flexWrap: 'wrap', marginBottom: 7 }}>
          <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-3)' }}>{task.done}/{task.total} units</span>
          <span className="mono" style={{ fontSize: 10.5, color: overdue ? 'var(--danger)' : 'var(--ink-4)' }}>{ST.fmtDue(task.due)}</span>
          {upd != null && !done && <span className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)' }}>{upd < 1 ? upd.toFixed(1) : Math.ceil(upd)}/day</span>}
          {task.notes && <span style={{ fontSize: 10.5, color: 'var(--ink-4)', fontStyle: 'italic', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 160 }}>“{task.notes}”</span>}
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, maxWidth: 220 }}><Bar value={pct} color={done ? 'var(--ok)' : ST.color(course.color)} height={6} /></div>
          <span className="mono" style={{ fontSize: 11, color: 'var(--ink-4)', minWidth: 32 }}>{pct}%</span>
        </div>
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
          <button className="mini-btn" onClick={() => onProgress(task.id, +1)} title="Add unit" style={miniBtn}><Icon name="plus" size={13} /></button>
          <button className="mini-btn" onClick={() => onProgress(task.id, -1)} title="Remove unit" style={miniBtn}><Icon name="minus" size={13} /></button>
        </div>
        <Btn size="sm" variant="primary" icon="play" onClick={() => onFocus(task)} title="Send to timer">Focus</Btn>
        <button onClick={() => onRemove(task.id)} title="Remove task" style={{ ...miniBtn, color: 'var(--ink-4)', width: 30, height: 30 }} className="danger-hover"><Icon name="trash" size={14} /></button>
      </div>
    </div>
  );
}

function AddTaskForm({ onAdd, onCancel }) {
  const [f, setF] = useState({ title: '', total: 10, done: 0, priority: 'medium', due: '', notes: '' });
  const set = (k, v) => setF(s => ({ ...s, [k]: v }));
  const submit = () => { if (!f.title.trim()) return; onAdd({ ...f, total: +f.total || 1, done: +f.done || 0, due: f.due || null }); };
  return (
    <div style={{ padding: 16, borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px dashed var(--accent-line)', display: 'flex', flexDirection: 'column', gap: 12 }} className="fade-up">
      <Field label="Task title"><Input autoFocus value={f.title} placeholder="e.g. Problem set 8" onChange={e => set('title', e.target.value)} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(120px, 1fr))', gap: 12 }}>
        <Field label="Total units"><Input type="number" min="1" value={f.total} onChange={e => set('total', e.target.value)} /></Field>
        <Field label="Completed"><Input type="number" min="0" value={f.done} onChange={e => set('done', e.target.value)} /></Field>
        <Field label="Priority"><Segmented full size="sm" value={f.priority} onChange={v => set('priority', v)} options={[{value:'high',label:'High'},{value:'medium',label:'Med'},{value:'low',label:'Low'}]} /></Field>
        <Field label="Due date (optional)"><Input type="date" value={f.due} onChange={e => set('due', e.target.value)} /></Field>
      </div>
      <Field label="Notes (optional)"><Textarea value={f.notes} placeholder="Anything to remember…" onChange={e => set('notes', e.target.value)} style={{ minHeight: 48 }} /></Field>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="quiet" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" icon="plus" onClick={submit}>Add task</Btn>
      </div>
    </div>
  );
}

function AddCourseForm({ onAdd, onCancel }) {
  const [f, setF] = useState({ name: '', target: 5.0, color: 'blue' });
  const submit = () => { if (!f.name.trim()) return; onAdd(f); };
  return (
    <div style={{ padding: 16, borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px dashed var(--accent-line)', display: 'flex', flexDirection: 'column', gap: 12 }} className="fade-up">
      <Field label="Course name"><Input autoFocus value={f.name} placeholder="e.g. Probability Theory" onChange={e => setF(s => ({ ...s, name: e.target.value }))} onKeyDown={e => e.key === 'Enter' && submit()} /></Field>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <Field label={`Target grade · ${(+f.target).toFixed(2)}`} style={{ flex: 1, minWidth: 180 }}>
          <input type="range" min="4" max="6" step="0.25" value={f.target} onChange={e => setF(s => ({ ...s, target: +e.target.value }))} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 2 }}>
            <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4)' }}>4.0</span>
            <span className="mono" style={{ fontSize: 9, color: 'var(--ink-4)' }}>6.0</span>
          </div>
        </Field>
        <Field label="Color">
          <div style={{ display: 'flex', gap: 6 }}>
            {PALETTE.map(c => (
              <button key={c} onClick={() => setF(s => ({ ...s, color: c }))} style={{ width: 24, height: 24, borderRadius: 7, background: ST.color(c), cursor: 'pointer', border: '2px solid', borderColor: f.color === c ? 'var(--ink)' : 'transparent', boxShadow: f.color === c ? '0 0 0 2px var(--surface)' : 'none' }} />
            ))}
          </div>
        </Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="quiet" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" icon="plus" onClick={submit}>Add course</Btn>
      </div>
    </div>
  );
}

function AddExamForm({ sem, onAdd, onCancel }) {
  const [f, setF] = useState({ courseId: sem.courses[0]?.id || '', title: '', date: '', weight: 50, prep: 0 });
  const submit = () => { if (!f.title.trim() || !f.courseId) return; onAdd({ ...f, weight: +f.weight, prep: +f.prep, date: f.date || null }); };
  return (
    <div style={{ padding: 16, borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px dashed var(--accent-line)', display: 'flex', flexDirection: 'column', gap: 12 }} className="fade-up">
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px,1fr))', gap: 12 }}>
        <Field label="Course"><select value={f.courseId} onChange={e => setF(s => ({ ...s, courseId: e.target.value }))} style={{ ...inputStyle }}>{sem.courses.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}</select></Field>
        <Field label="Exam title"><Input value={f.title} placeholder="e.g. Final" onChange={e => setF(s => ({ ...s, title: e.target.value }))} /></Field>
        <Field label="Date"><Input type="date" value={f.date} onChange={e => setF(s => ({ ...s, date: e.target.value }))} /></Field>
        <Field label={`Weight · ${f.weight}%`}><input type="range" min="0" max="100" step="5" value={f.weight} onChange={e => setF(s => ({ ...s, weight: e.target.value }))} style={{ width: '100%', accentColor: 'var(--accent)' }} /></Field>
        <Field label={`Preparedness · ${f.prep}%`}><input type="range" min="0" max="100" step="5" value={f.prep} onChange={e => setF(s => ({ ...s, prep: e.target.value }))} style={{ width: '100%', accentColor: 'var(--accent)' }} /></Field>
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <Btn variant="quiet" onClick={onCancel}>Cancel</Btn>
        <Btn variant="primary" icon="plus" onClick={submit}>Add exam</Btn>
      </div>
    </div>
  );
}

Object.assign(window, { PALETTE, miniBtn, TaskRow, AddTaskForm, AddCourseForm, AddExamForm });
