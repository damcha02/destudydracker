/* ============================================================
   Planner — part 2: course/semester blocks, right rail, shell
   ============================================================ */

function CourseBlock({ data, sem, course, dispatch, onFocus }) {
  const [adding, setAdding] = useState(false);
  const health = ST.courseHealth(data, course);
  const st = ST.scoreState(health);
  const totalUnits = course.tasks.reduce((a, t) => a + t.total, 0);
  const doneUnits = course.tasks.reduce((a, t) => a + t.done, 0);
  return (
    <div style={{ borderRadius: 'var(--r-md)', border: '1px solid var(--line)', background: 'var(--surface)', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '13px 15px', cursor: 'pointer', background: course.expanded ? 'var(--surface-2)' : 'transparent' }}
        onClick={() => dispatch({ type: 'toggleCourse', semId: sem.id, courseId: course.id })}>
        <Icon name={course.expanded ? 'chevronDown' : 'chevron'} size={16} style={{ color: 'var(--ink-4)' }} />
        <div style={{ width: 10, height: 10, borderRadius: 3, background: ST.color(course.color), flexShrink: 0 }} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14.5, fontWeight: 600 }}>{course.name}</div>
          <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 3 }}>{course.tasks.length} tasks · {doneUnits}/{totalUnits} units</div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ textAlign: 'right' }}>
            <div className="eyebrow" style={{ fontSize: 8.5, marginBottom: 2 }}>Target</div>
            <div className="mono" style={{ fontSize: 13, fontWeight: 600 }}>{course.target.toFixed(2)}</div>
          </div>
          <div style={{ width: 70 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span className="eyebrow" style={{ fontSize: 8.5 }}>Health</span>
              <span className="mono" style={{ fontSize: 10.5, fontWeight: 600, color: st.color }}>{health}</span>
            </div>
            <Bar value={health} color={st.color} height={5} />
          </div>
          <button onClick={(e) => { e.stopPropagation(); dispatch({ type: 'removeCourse', semId: sem.id, courseId: course.id }); }} title="Remove course" style={{ ...miniBtn, width: 28, height: 28, color: 'var(--ink-4)' }} className="danger-hover"><Icon name="trash" size={13} /></button>
        </div>
      </div>
      {course.expanded && (
        <div style={{ padding: '6px 15px 15px 40px', display: 'flex', flexDirection: 'column', gap: 8 }} className="fade-up">
          {course.tasks.length === 0 && !adding && <Empty icon="list" title="No tasks yet" sub="Break this course into units you can chip away at." />}
          {course.tasks.map(t => (
            <TaskRow key={t.id} task={t} course={course} onFocus={onFocus}
              onProgress={(id, delta) => dispatch({ type: 'progress', semId: sem.id, courseId: course.id, taskId: id, delta })}
              onRemove={(id) => dispatch({ type: 'removeTask', semId: sem.id, courseId: course.id, taskId: id })} />
          ))}
          {adding
            ? <AddTaskForm onAdd={(task) => { dispatch({ type: 'addTask', semId: sem.id, courseId: course.id, task }); setAdding(false); }} onCancel={() => setAdding(false)} />
            : <Btn variant="ghost" icon="plus" onClick={() => setAdding(true)} style={{ alignSelf: 'flex-start' }}>Add task</Btn>}
        </div>
      )}
    </div>
  );
}

function ExamItem({ data, sem, exam, dispatch }) {
  const course = ST.courseById(data, exam.courseId);
  const d = ST.daysUntil(exam.date);
  const prepCol = exam.prep >= 70 ? 'var(--ok)' : exam.prep >= 40 ? 'var(--warn)' : 'var(--danger)';
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)' }}>
      {course && <Dot color={course.color} size={9} />}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 13, fontWeight: 600 }}>{exam.title}</div>
        <div className="mono" style={{ fontSize: 10, color: 'var(--ink-4)', marginTop: 2 }}>{course ? course.name : '—'} · {exam.weight}% weight</div>
      </div>
      <div style={{ textAlign: 'right' }}>
        <div className="mono" style={{ fontSize: 11, color: d != null && d <= 10 ? 'var(--warn)' : 'var(--ink-3)' }}>{d == null ? 'No date' : d < 0 ? `${-d}d ago` : `in ${d}d`}</div>
        <div className="mono" style={{ fontSize: 10, color: prepCol, marginTop: 2 }}>{exam.prep}% ready</div>
      </div>
      <button onClick={() => dispatch({ type: 'removeExam', semId: sem.id, examId: exam.id })} title="Remove exam" style={{ ...miniBtn, width: 28, height: 28, color: 'var(--ink-4)' }} className="danger-hover"><Icon name="trash" size={13} /></button>
    </div>
  );
}

function SemesterBlock({ data, sem, dispatch, onFocus }) {
  const [addingCourse, setAddingCourse] = useState(false);
  const [addingExam, setAddingExam] = useState(false);
  return (
    <Card pad={0} style={{ overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '16px 18px', cursor: 'pointer' }} onClick={() => dispatch({ type: 'toggleSem', semId: sem.id })}>
        <Icon name={sem.expanded ? 'chevronDown' : 'chevron'} size={18} style={{ color: 'var(--ink-3)' }} />
        <div style={{ flex: 1 }}>
          <h2 className="serif" style={{ fontSize: 19, fontWeight: 500, margin: 0, letterSpacing: '-0.01em' }}>{sem.name}</h2>
          <div className="mono" style={{ fontSize: 10.5, color: 'var(--ink-4)', marginTop: 3 }}>{sem.courses.length} courses · {(sem.exams || []).length} exams</div>
        </div>
        <Btn size="sm" variant="quiet" icon="trash" onClick={(e) => { e.stopPropagation(); dispatch({ type: 'removeSem', semId: sem.id }); }} title="Remove semester" />
      </div>
      {sem.expanded && (
        <div style={{ padding: '0 18px 18px', display: 'flex', flexDirection: 'column', gap: 10 }} className="fade-up">
          <hr className="hairline" style={{ marginBottom: 4 }} />
          {sem.courses.map(c => <CourseBlock key={c.id} data={data} sem={sem} course={c} dispatch={dispatch} onFocus={onFocus} />)}
          {addingCourse
            ? <AddCourseForm onAdd={(course) => { dispatch({ type: 'addCourse', semId: sem.id, course }); setAddingCourse(false); }} onCancel={() => setAddingCourse(false)} />
            : <Btn variant="ghost" icon="plus" onClick={() => setAddingCourse(true)} style={{ alignSelf: 'flex-start' }}>Add course</Btn>}

          <div style={{ marginTop: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 10 }}>
              <span className="eyebrow" style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}><Icon name="cal" size={12} />Exams</span>
              <hr className="hairline" style={{ flex: 1 }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {(sem.exams || []).map(e => <ExamItem key={e.id} data={data} sem={sem} exam={e} dispatch={dispatch} />)}
              {addingExam
                ? <AddExamForm sem={sem} onAdd={(exam) => { dispatch({ type: 'addExam', semId: sem.id, exam }); setAddingExam(false); }} onCancel={() => setAddingExam(false)} />
                : (sem.courses.length > 0 && <Btn variant="ghost" icon="plus" onClick={() => setAddingExam(true)} style={{ alignSelf: 'flex-start' }}>Add exam</Btn>)}
            </div>
          </div>
        </div>
      )}
    </Card>
  );
}

/* ---------- Workload calculator (right rail) ---------- */
function WorkloadCalc({ data, selectedTaskId }) {
  const [mode, setMode] = useState('task'); // task | total
  const [days, setDays] = useState(7);
  const task = ST.taskById(data, selectedTaskId);
  let pct, remaining, total, label;
  if (mode === 'task' && task) {
    total = task.total; remaining = ST.taskRemaining(task); pct = ST.taskPct(task); label = task.title;
  } else {
    const tasks = ST.allTasks(data).filter(t => t.semId === 'sem-fs26');
    total = tasks.reduce((a, t) => a + t.total, 0);
    const done = tasks.reduce((a, t) => a + t.done, 0);
    remaining = total - done; pct = total ? Math.round(done / total * 100) : 0; label = 'All active tasks';
  }
  const perDay = remaining > 0 ? (remaining / days) : 0;
  return (
    <Card>
      <CardHead eyebrow="Workload calculator" icon="target" title="Plan your pace" />
      <Segmented full size="sm" value={mode} onChange={setMode} options={[{ value: 'task', label: 'Selected task' }, { value: 'total', label: 'Total workload' }]} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 18, margin: '18px 0' }}>
        <Ring value={pct} size={104} stroke={10} color={mode === 'task' && task ? ST.color(task.color) : 'var(--accent)'} label={pct + '%'} sub="done" />
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>{label}</div>
          <div className="mono" style={{ fontSize: 11, color: 'var(--ink-3)', marginBottom: 12 }}>{remaining} of {total} units left</div>
          <Field label={`Finish in · ${days} days`}>
            <input type="range" min="1" max="30" value={days} onChange={e => setDays(+e.target.value)} style={{ width: '100%', accentColor: 'var(--accent)' }} />
          </Field>
        </div>
      </div>
      <div style={{ padding: '13px 15px', borderRadius: 'var(--r-md)', background: 'var(--accent-soft)', border: '1px solid var(--accent-line)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontSize: 12.5, color: 'var(--ink-2)' }}>You'll need</span>
        <span className="mono" style={{ fontSize: 16, fontWeight: 600, color: 'var(--accent)' }}>{perDay < 1 && perDay > 0 ? perDay.toFixed(1) : Math.ceil(perDay)} units/day</span>
      </div>
    </Card>
  );
}

/* ---------- Semester overview (right rail) ---------- */
function SemesterOverview({ data }) {
  const sem = data.semesters.find(s => s.id === 'sem-fs26');
  if (!sem) return null;
  const exams = (sem.exams || []).filter(e => { const d = ST.daysUntil(e.date); return d != null && d >= 0; }).sort((a, b) => ST.daysUntil(a.date) - ST.daysUntil(b.date));
  const next = exams[0];
  const nextCourse = next ? ST.courseById(data, next.courseId) : null;
  return (
    <Card>
      <CardHead eyebrow="Semester overview" icon="book" title={sem.name} />
      <div style={{ display: 'flex', gap: 10, marginBottom: 16 }}>
        <div style={{ flex: 1, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)' }}>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{sem.courses.length}</div>
          <div className="eyebrow" style={{ fontSize: 9, marginTop: 3 }}>Courses</div>
        </div>
        <div style={{ flex: 1, padding: '12px 14px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)' }}>
          <div className="mono" style={{ fontSize: 22, fontWeight: 600 }}>{(sem.exams || []).length}</div>
          <div className="eyebrow" style={{ fontSize: 9, marginTop: 3 }}>Exams</div>
        </div>
      </div>
      {next && (
        <div style={{ padding: '13px 15px', borderRadius: 'var(--r-md)', background: 'var(--surface-inset)', border: '1px solid var(--line-soft)', marginBottom: 14 }}>
          <div className="eyebrow" style={{ fontSize: 9, marginBottom: 6 }}>Next exam</div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              {nextCourse && <Dot color={nextCourse.color} size={9} />}
              <span style={{ fontSize: 13.5, fontWeight: 600 }}>{next.title}</span>
            </div>
            <span className="mono" style={{ fontSize: 13, fontWeight: 600, color: 'var(--warn)' }}>{ST.daysUntil(next.date)}d</span>
          </div>
        </div>
      )}
      <div className="eyebrow" style={{ fontSize: 9, marginBottom: 8 }}>All exams</div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
        {(sem.exams || []).map(e => {
          const c = ST.courseById(data, e.courseId);
          return <Chip key={e.id} size="sm" color={c ? ST.color(c.color) : 'var(--ink-3)'} bg="var(--surface-inset)">{e.title} · {ST.fmtDue(e.date)}</Chip>;
        })}
      </div>
    </Card>
  );
}

/* ---------- Planner shell ---------- */
function Planner({ data, dispatch, onFocus, selectedTaskId }) {
  const [addingSem, setAddingSem] = useState(false);
  const [newSemName, setNewSemName] = useState('');
  const addSem = () => { if (!newSemName.trim()) return; dispatch({ type: 'addSem', name: newSemName.trim() }); setNewSemName(''); setAddingSem(false); };
  return (
    <div className="fade-up" style={{ display: 'grid', gridTemplateColumns: 'minmax(0,1fr) 340px', gap: 18, alignItems: 'start' }} >
      <div className="planner-main" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 12 }}>
          <div>
            <h1 className="serif" style={{ fontSize: 27, fontWeight: 500, margin: 0, letterSpacing: '-0.02em' }}>Planner</h1>
            <p style={{ margin: '5px 0 0', fontSize: 13.5, color: 'var(--ink-3)' }}>Semester → Course → Task. Expand to plan, collapse to breathe.</p>
          </div>
          {!addingSem && <Btn variant="primary" icon="plus" onClick={() => setAddingSem(true)}>Add semester</Btn>}
        </div>
        {addingSem && (
          <Card style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }} className="fade-up">
            <Field label="Semester name" style={{ flex: 1 }}><Input autoFocus value={newSemName} placeholder="e.g. Autumn Semester 2026" onChange={e => setNewSemName(e.target.value)} onKeyDown={e => e.key === 'Enter' && addSem()} /></Field>
            <Btn variant="quiet" onClick={() => setAddingSem(false)}>Cancel</Btn>
            <Btn variant="primary" icon="plus" onClick={addSem}>Add</Btn>
          </Card>
        )}
        {data.semesters.map(s => <SemesterBlock key={s.id} data={data} sem={s} dispatch={dispatch} onFocus={onFocus} />)}
      </div>
      <div className="planner-rail" style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0 }}>
        <WorkloadCalc data={data} selectedTaskId={selectedTaskId} />
        <SemesterOverview data={data} />
      </div>
    </div>
  );
}

Object.assign(window, { CourseBlock, ExamItem, SemesterBlock, WorkloadCalc, SemesterOverview, Planner });
