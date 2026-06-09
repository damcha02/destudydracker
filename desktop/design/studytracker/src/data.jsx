/* ============================================================
   Study Tracker — Seed data + domain helpers
   Exposes window.STData (seed) and window.ST (helpers)
   Data model mirrors the Tauri/React app for clean hand-off.
   ============================================================ */

(function () {
  // ---- date helpers ----------------------------------------
  const DAY = 86400000;
  const today = new Date('2026-06-09T09:00:00');
  function iso(d) { return d.toISOString().slice(0, 10); }
  function addDays(n) { return iso(new Date(today.getTime() + n * DAY)); }
  function daysUntil(dateStr) {
    if (!dateStr) return null;
    const d = new Date(dateStr + 'T00:00:00');
    const t = new Date(iso(today) + 'T00:00:00');
    return Math.round((d - t) / DAY);
  }

  // ---- course palette (consistent accents) -----------------
  const COURSE_COLORS = {
    blue:   'oklch(0.70 0.11 245)',
    violet: 'oklch(0.70 0.12 295)',
    teal:   'oklch(0.74 0.09 195)',
    amber:  'oklch(0.79 0.12 72)',
    rose:   'oklch(0.71 0.13 12)',
    green:  'oklch(0.75 0.10 150)',
    cyan:   'oklch(0.76 0.08 215)',
    plum:   'oklch(0.66 0.12 330)',
  };

  // ---- seed semesters / courses / tasks / exams ------------
  const seed = {
    meta: { vaultName: 'StudyVault', vaultPath: '~/Documents/StudyVault', model: 'claude-3-5-sonnet', apiKey: '' },
    semesters: [
      {
        id: 'sem-fs26', name: 'Spring Semester 2026', expanded: true,
        courses: [
          {
            id: 'c-analysis', name: 'Analysis II', target: 5.5, color: 'blue', expanded: true,
            tasks: [
              { id: 't-a1', title: 'Series & convergence problem set', total: 12, done: 9, priority: 'high', due: addDays(2), notes: 'Focus on ratio + root tests.' },
              { id: 't-a2', title: 'Multivariable integration drills', total: 20, done: 6, priority: 'medium', due: addDays(9), notes: '' },
              { id: 't-a3', title: 'Review Taylor series lecture', total: 4, done: 4, priority: 'low', due: addDays(-3), notes: 'Done — re-watch before exam.' },
            ],
          },
          {
            id: 'c-algo', name: 'Algorithms & Data Structures', target: 5.0, color: 'violet', expanded: true,
            tasks: [
              { id: 't-b1', title: 'Graph algorithms exercise 7', total: 10, done: 2, priority: 'high', due: addDays(1), notes: 'Dijkstra + MST.' },
              { id: 't-b2', title: 'Dynamic programming practice', total: 15, done: 8, priority: 'medium', due: addDays(6), notes: '' },
              { id: 't-b3', title: 'Implement red-black tree', total: 8, done: 1, priority: 'low', due: null, notes: 'Optional bonus.' },
            ],
          },
          {
            id: 'c-physics', name: 'Physics II — Electromagnetism', target: 4.5, color: 'amber', expanded: false,
            tasks: [
              { id: 't-c1', title: 'Maxwell equations problem set', total: 14, done: 3, priority: 'high', due: addDays(4), notes: '' },
              { id: 't-c2', title: 'Lab report: induction', total: 6, done: 5, priority: 'medium', due: addDays(-1), notes: 'Almost done.' },
            ],
          },
          {
            id: 'c-linalg', name: 'Linear Algebra', target: 6.0, color: 'teal', expanded: false,
            tasks: [
              { id: 't-d1', title: 'Eigenvalue exercises', total: 10, done: 10, priority: 'low', due: addDays(-5), notes: 'Complete.' },
              { id: 't-d2', title: 'Singular value decomposition set', total: 9, done: 7, priority: 'medium', due: addDays(12), notes: '' },
            ],
          },
        ],
        exams: [
          { id: 'e-1', courseId: 'c-algo', title: 'Algorithms Midterm', date: addDays(8), weight: 30, prep: 58 },
          { id: 'e-2', courseId: 'c-analysis', title: 'Analysis II Final', date: addDays(21), weight: 70, prep: 34 },
          { id: 'e-3', courseId: 'c-physics', title: 'Physics II Final', date: addDays(34), weight: 60, prep: 20 },
        ],
      },
      {
        id: 'sem-hs25', name: 'Autumn Semester 2025', expanded: false,
        courses: [
          {
            id: 'c-discrete', name: 'Discrete Mathematics', target: 5.0, color: 'green', expanded: false,
            tasks: [
              { id: 't-e1', title: 'Combinatorics review', total: 8, done: 8, priority: 'low', due: addDays(-120), notes: 'Archived.' },
            ],
          },
          {
            id: 'c-prog', name: 'Introduction to Programming', target: 5.5, color: 'cyan', expanded: false,
            tasks: [
              { id: 't-f1', title: 'Final project: ray tracer', total: 30, done: 30, priority: 'low', due: addDays(-110), notes: 'Graded 5.75.' },
            ],
          },
        ],
        exams: [
          { id: 'e-old', courseId: 'c-prog', title: 'Programming Final', date: addDays(-100), weight: 50, prep: 100 },
        ],
      },
    ],
    // study/exam sessions
    sessions: [
      { id: 's1', preset: 'Deep Work', phase: 'study', semId: 'sem-fs26', courseId: 'c-algo', taskId: 't-b1', goal: 'Crack Dijkstra exercise', learned: 'Priority queue makes relaxation clean.', blocker: 'Negative edges still fuzzy.', next: 'Try Bellman-Ford set.', confidence: 4, minutes: 52, start: addDays(0) + 'T08:05', end: addDays(0) + 'T08:57' },
      { id: 's2', preset: 'Pomodoro', phase: 'study', semId: 'sem-fs26', courseId: 'c-analysis', taskId: 't-a1', goal: 'Series convergence', learned: 'Ratio test edge cases.', blocker: '', next: 'Root test problems.', confidence: 3, minutes: 25, start: addDays(0) + 'T07:20', end: addDays(0) + 'T07:45' },
      { id: 's3', preset: 'Exam', phase: 'exam', semId: 'sem-fs26', courseId: 'c-physics', taskId: null, goal: 'Mock exam', learned: 'Gauss law symmetry tricks.', blocker: 'Boundary conditions.', next: 'Redo flux integrals.', confidence: 2, minutes: 120, start: addDays(-1) + 'T14:00', end: addDays(-1) + 'T16:00' },
      { id: 's4', preset: 'Deep Work', phase: 'study', semId: 'sem-fs26', courseId: 'c-algo', taskId: 't-b2', goal: 'DP practice', learned: 'Memoization vs tabulation.', blocker: '', next: 'Knapsack variants.', confidence: 4, minutes: 52, start: addDays(-1) + 'T10:00', end: addDays(-1) + 'T10:52' },
      { id: 's5', preset: 'Sprint', phase: 'study', semId: 'sem-fs26', courseId: 'c-analysis', taskId: 't-a2', goal: 'Integration drills', learned: 'Change of variables.', blocker: 'Jacobians.', next: 'Polar coordinates set.', confidence: 3, minutes: 90, start: addDays(-2) + 'T13:00', end: addDays(-2) + 'T14:30' },
      { id: 's6', preset: 'Pomodoro', phase: 'study', semId: 'sem-fs26', courseId: 'c-linalg', taskId: 't-d2', goal: 'SVD', learned: 'Geometric meaning of singular values.', blocker: '', next: 'Applications.', confidence: 5, minutes: 50, start: addDays(-3) + 'T09:00', end: addDays(-3) + 'T09:50' },
      { id: 's7', preset: 'Deep Work', phase: 'study', semId: 'sem-fs26', courseId: 'c-physics', taskId: 't-c1', goal: 'Maxwell set', learned: "Ampère's law applications.", blocker: 'Displacement current.', next: 'More problems.', confidence: 3, minutes: 78, start: addDays(-4) + 'T15:00', end: addDays(-4) + 'T16:18' },
      { id: 's8', preset: 'Pomodoro', phase: 'study', semId: 'sem-fs26', courseId: 'c-algo', taskId: 't-b1', goal: 'Graph review', learned: 'BFS/DFS templates.', blocker: '', next: 'Shortest paths.', confidence: 4, minutes: 25, start: addDays(-5) + 'T11:00', end: addDays(-5) + 'T11:25' },
      { id: 's9', preset: 'Deep Work', phase: 'study', semId: 'sem-fs26', courseId: 'c-analysis', taskId: 't-a1', goal: 'Convergence proofs', learned: 'Cauchy criterion.', blocker: '', next: 'Series set.', confidence: 4, minutes: 60, start: addDays(-6) + 'T08:30', end: addDays(-6) + 'T09:30' },
    ],
    streak: 6,
    selectedTaskId: 't-b1',
  };

  // ---- domain helpers --------------------------------------
  const helpers = {
    DAY, today, iso, addDays, daysUntil, COURSE_COLORS,

    color(key) { return COURSE_COLORS[key] || COURSE_COLORS.blue; },

    allCourses(data) {
      const out = [];
      data.semesters.forEach(s => s.courses.forEach(c => out.push({ ...c, semId: s.id, semName: s.name })));
      return out;
    },
    courseById(data, id) {
      for (const s of data.semesters) for (const c of s.courses) if (c.id === id) return { ...c, semId: s.id, semName: s.name };
      return null;
    },
    taskById(data, id) {
      for (const s of data.semesters) for (const c of s.courses) for (const t of c.tasks) if (t.id === id) return { ...t, courseId: c.id, courseName: c.name, color: c.color, semId: s.id };
      return null;
    },
    allTasks(data) {
      const out = [];
      data.semesters.forEach(s => s.courses.forEach(c => c.tasks.forEach(t =>
        out.push({ ...t, courseId: c.id, courseName: c.name, color: c.color, semId: s.id, semName: s.name }))));
      return out;
    },
    allExams(data) {
      const out = [];
      data.semesters.forEach(s => (s.exams || []).forEach(e => out.push({ ...e, semId: s.id, semName: s.name })));
      return out;
    },

    taskPct(t) { return t.total > 0 ? Math.round((t.done / t.total) * 100) : 0; },
    taskRemaining(t) { return Math.max(0, t.total - t.done); },
    isOverdue(t) {
      const d = helpers.daysUntil(t.due);
      return t.due != null && d != null && d < 0 && t.done < t.total;
    },
    // units per day needed to finish by due date
    unitsPerDay(t) {
      const rem = helpers.taskRemaining(t);
      if (rem === 0) return 0;
      const d = helpers.daysUntil(t.due);
      if (d == null) return null;
      if (d <= 0) return rem; // due today/overdue → all now
      return rem / d;
    },

    // urgency score for prioritisation (higher = more urgent)
    urgency(t) {
      if (t.done >= t.total) return -1;
      const d = helpers.daysUntil(t.due);
      const prioW = t.priority === 'high' ? 3 : t.priority === 'medium' ? 2 : 1;
      const rem = helpers.taskRemaining(t);
      let dueW = 0;
      if (d == null) dueW = 0.5;
      else if (d < 0) dueW = 5;
      else if (d <= 1) dueW = 4;
      else if (d <= 3) dueW = 3;
      else if (d <= 7) dueW = 2;
      else dueW = 1;
      return prioW * dueW + Math.min(rem, 10) * 0.15;
    },

    // course health 0-100 from completion, overdue, prep
    courseHealth(data, course) {
      const tasks = course.tasks || [];
      if (tasks.length === 0) return 70;
      const totalUnits = tasks.reduce((a, t) => a + t.total, 0);
      const doneUnits = tasks.reduce((a, t) => a + t.done, 0);
      const compl = totalUnits ? doneUnits / totalUnits : 1;
      const overdue = tasks.filter(t => helpers.isOverdue(t)).length;
      let h = compl * 100;
      h -= overdue * 12;
      return Math.max(4, Math.min(100, Math.round(h)));
    },
    courseMinutes(data, courseId) {
      return data.sessions.filter(s => s.courseId === courseId).reduce((a, s) => a + s.minutes, 0);
    },
    courseOverdue(course) {
      return (course.tasks || []).filter(t => helpers.isOverdue(t)).length;
    },

    // overall score out of 100
    overallScore(data) {
      const courses = helpers.allCourses(data).filter(c => {
        const sem = data.semesters.find(s => s.id === c.semId);
        return sem && sem.id === 'sem-fs26'; // active semester
      });
      if (courses.length === 0) return 70;
      const avgHealth = courses.reduce((a, c) => a + helpers.courseHealth(data, c), 0) / courses.length;
      const exams = helpers.allExams(data).filter(e => {
        const d = helpers.daysUntil(e.date); return d != null && d >= 0 && d <= 45;
      });
      const avgPrep = exams.length ? exams.reduce((a, e) => a + e.prep, 0) / exams.length : 70;
      const overdueCount = helpers.allTasks(data).filter(t => helpers.isOverdue(t)).length;
      let score = avgHealth * 0.5 + avgPrep * 0.35 + Math.min(data.streak, 14) / 14 * 100 * 0.15;
      score -= overdueCount * 3;
      return Math.max(0, Math.min(100, Math.round(score)));
    },
    scoreState(score) {
      if (score >= 80) return { label: 'Strong', color: 'var(--ok)', key: 'strong' };
      if (score >= 60) return { label: 'Steady', color: 'var(--steady)', key: 'steady' };
      if (score >= 40) return { label: 'Watch', color: 'var(--watch)', key: 'watch' };
      return { label: 'Critical', color: 'var(--critical)', key: 'critical' };
    },

    // focus minutes today
    minutesToday(data) {
      const t = helpers.iso(helpers.today);
      return data.sessions.filter(s => (s.start || '').slice(0, 10) === t).reduce((a, s) => a + s.minutes, 0);
    },
    // last 7 days [{day, label, minutes}]
    weeklyFocus(data) {
      const out = [];
      for (let i = 6; i >= 0; i--) {
        const dStr = helpers.addDays(-i);
        const mins = data.sessions.filter(s => (s.start || '').slice(0, 10) === dStr).reduce((a, s) => a + s.minutes, 0);
        const dt = new Date(dStr + 'T00:00:00');
        out.push({ day: dStr, label: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][dt.getDay()], minutes: mins, isToday: i === 0 });
      }
      return out;
    },
    // momentum: today's mins vs 7-day average
    momentum(data) {
      const wk = helpers.weeklyFocus(data);
      const avg = wk.reduce((a, d) => a + d.minutes, 0) / 7;
      const todayM = wk[wk.length - 1].minutes;
      if (avg === 0) return { pct: 0, dir: 'flat' };
      const pct = Math.round((todayM - avg) / avg * 100);
      return { pct, dir: pct > 5 ? 'up' : pct < -5 ? 'down' : 'flat', avg: Math.round(avg) };
    },
    // garden growth stage 0..5 from total minutes this week
    gardenStage(data) {
      const total = helpers.weeklyFocus(data).reduce((a, d) => a + d.minutes, 0);
      // 0..600+ minutes maps to 0..5
      return Math.max(0, Math.min(5, Math.floor(total / 110)));
    },

    fmtMins(m) {
      const h = Math.floor(m / 60), mm = m % 60;
      if (h === 0) return `${mm}m`;
      if (mm === 0) return `${h}h`;
      return `${h}h ${mm}m`;
    },
    fmtDue(due) {
      const d = helpers.daysUntil(due);
      if (due == null) return 'No date';
      if (d === 0) return 'Today';
      if (d === 1) return 'Tomorrow';
      if (d === -1) return 'Yesterday';
      if (d < 0) return `${-d}d overdue`;
      if (d < 7) return `${d} days`;
      const dt = new Date(due + 'T00:00:00');
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
    },
    fmtTime(isoStr) {
      if (!isoStr) return '';
      const dt = new Date(isoStr);
      return dt.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' · ' +
        dt.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    },
    uid(prefix) { return (prefix || 'id') + '-' + Math.random().toString(36).slice(2, 8); },
  };

  window.STData = seed;
  window.ST = helpers;
})();
