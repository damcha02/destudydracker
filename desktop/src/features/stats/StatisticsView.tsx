import { useMemo, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { Course, Semester, StudySession } from "../../types";
import { formatMinutes } from "../../lib/metrics";
import {
  addDays,
  buildMinutesByCourseDay,
  buildWindowCurve,
  daysBetween,
  formatCredits,
  formatHours,
  getSemesterWindow,
  loadCourseCredits,
  loadHoursPerCredit,
  minutesToCredits,
  saveCourseCredits,
  saveHoursPerCredit,
  sumCourse,
  summarizeCourse,
  getTodoNames,
} from "../../lib/statistics";
import type { CourseSummary, CurvePoint } from "../../lib/statistics";
import "./statistics.css";

type Range = "semester" | "30" | "90" | "all";

const TODO_SCOPE = "__todos";
/** Every course of every semester, without to-dos ("" is that plus the to-dos). */
const COURSES_SCOPE = "__courses";
const TODO_COLORS = ["#8a7226", "#6b5a7a", "#3f6b73", "#a0613a", "#5b6b3a", "#7a4a58", "#4a5f8a", "#8a5a6a"];
const TODO_COLORS_NOTEBOOK = ["#9a7c3a", "#8a5670", "#4a5f86", "#4f6b4a", "#9c5a34", "#3c5f7a", "#6d6656", "#5a4a7a"];
const TODO_COLORS_MODERN = ["#e0a458", "#a78bfa", "#34b3a0", "#f472b6", "#84cc16", "#60a5fa", "#fb923c", "#c084fc"];

interface Props {
  /** Wabi-Sabi paper and ink, the Modern card style, or the Field Notebook ledger. */
  variant?: "wabi" | "modern" | "notebook";
  sessions: StudySession[];
  semesters: Semester[];
  courses: Course[];
  today: string;
  currentSemesterId: string | null;
}

interface Item {
  id: string;
  name: string;
  color: string;
  semesterId: string | null;
}

const monthDay = (date: string) => new Intl.DateTimeFormat("en", { month: "short", day: "numeric" }).format(new Date(`${date}T00:00:00`));

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  for (const step of [1, 2, 2.5, 5, 10]) if (value <= step * magnitude) return step * magnitude;
  return 10 * magnitude;
}

interface LineSeries {
  id: string;
  label: string;
  color: string;
  values: number[];
  dashed?: boolean;
  heavy?: boolean;
}

/** Shared SVG line chart: hours on the left axis, credits on the right, hover crosshair listing every series. */
function LineChart({ dates, series, hoursPerCredit }: { dates: string[]; series: LineSeries[]; hoursPerCredit: number }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 820;
  const H = 280;
  const L = 46;
  const R = 46;
  const T = 26;
  const B = 28;
  const maxMinutes = Math.max(0, ...series.flatMap((line) => line.values));
  const maxHours = niceMax(maxMinutes / 60);
  const count = dates.length;
  const x = (index: number) => L + (count <= 1 ? 0 : (index / (count - 1)) * (W - L - R));
  const y = (minutes: number) => T + (1 - minutes / 60 / maxHours) * (H - T - B);
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const labelEvery = Math.max(1, Math.ceil(count / 6));

  function onMove(event: ReactMouseEvent<SVGRectElement>) {
    const box = event.currentTarget.getBoundingClientRect();
    const fraction = (event.clientX - box.left) / box.width;
    setHover(Math.max(0, Math.min(count - 1, Math.round(fraction * (count - 1)))));
  }

  const hoverX = hover === null ? 0 : x(hover);
  const tipLeft = hover !== null && hover > count * 0.62;
  return (
    <div className="wst-chart">
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Study hours over time">
        {ticks.map((tick) => {
          const yy = T + (1 - tick) * (H - T - B);
          return (
            <g key={tick}>
              <line x1={L} x2={W - R} y1={yy} y2={yy} className="wst-grid" />
              <text x={L - 8} y={yy + 4} textAnchor="end" className="wst-axis">{formatTick(maxHours * tick)}h</text>
              <text x={W - R + 8} y={yy + 4} className="wst-axis wst-axis-credit">{formatTick((maxHours * tick) / hoursPerCredit)}</text>
            </g>
          );
        })}
        <text x={W - R + 8} y={T - 16} className="wst-axis wst-axis-credit">ECTS</text>
        {dates.map((date, index) => (index % labelEvery === 0 ? <text key={date} x={x(index)} y={H - 8} textAnchor="middle" className="wst-axis">{monthDay(date)}</text> : null))}
        {series.map((line) => (
          <polyline
            key={line.id}
            points={line.values.map((value, index) => `${x(index).toFixed(1)},${y(value).toFixed(1)}`).join(" ")}
            fill="none"
            stroke={line.color}
            strokeWidth={line.heavy ? 2.6 : 1.8}
            strokeDasharray={line.dashed ? "7 5" : undefined}
            strokeLinecap="round"
            strokeLinejoin="round"
            className="wst-line"
          />
        ))}
        {hover !== null ? (
          <g>
            <line x1={hoverX} x2={hoverX} y1={T} y2={H - B} className="wst-cross" />
            {series.map((line) => <circle key={line.id} cx={hoverX} cy={y(line.values[hover] ?? 0)} r="3.5" fill={line.color} />)}
          </g>
        ) : null}
        <rect x={L} y={T} width={W - L - R} height={H - T - B} fill="transparent" onMouseMove={onMove} onMouseLeave={() => setHover(null)} />
      </svg>
      {hover !== null ? (
        <div className="wst-tip" style={{ left: tipLeft ? undefined : `${(hoverX / W) * 100}%`, right: tipLeft ? `${(1 - hoverX / W) * 100}%` : undefined }}>
          <strong>{monthDay(dates[hover])}</strong>
          {[...series].sort((a, b) => (b.values[hover] ?? 0) - (a.values[hover] ?? 0)).map((line) => (
            <span key={line.id}><i style={{ background: line.color }} />{line.label}<b>{formatHours(line.values[hover] ?? 0)}h · {formatCredits(minutesToCredits(line.values[hover] ?? 0, hoursPerCredit))}</b></span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function formatTick(value: number): string {
  return value >= 10 || Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

export function StatisticsView({ sessions, semesters, courses, today, currentSemesterId, variant = "wabi" }: Props) {
  const modern = variant === "modern";
  const todoColors = modern ? TODO_COLORS_MODERN : variant === "notebook" ? TODO_COLORS_NOTEBOOK : TODO_COLORS;
  const [scope, setScope] = useState<string>(currentSemesterId ?? "");
  const [range, setRange] = useState<Range>("semester");
  const [chipsOpen, setChipsOpen] = useState(false);
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [hoursPerCredit, setHoursPerCreditState] = useState<number>(loadHoursPerCredit);
  const [credits, setCredits] = useState<Record<string, number>>(loadCourseCredits);

  function setHoursPerCredit(value: number) {
    setHoursPerCreditState(value);
    if (value > 0) saveHoursPerCredit(value);
  }
  function setCourseCredits(id: string, value: number) {
    setCredits((current) => {
      const next = { ...current };
      if (value > 0) next[id] = value; else delete next[id];
      saveCourseCredits(next);
      return next;
    });
  }

  const data = useMemo(() => buildMinutesByCourseDay(sessions), [sessions]);
  const semester = semesters.find((item) => item.id === scope) ?? null;

  const window = useMemo(() => {
    let earliest = today;
    for (const days of data.values()) for (const date of days.keys()) if (date < earliest) earliest = date;
    if (range === "30") return { from: addDays(today, -29), to: today };
    if (range === "90") return { from: addDays(today, -89), to: today };
    if (range === "all") return { from: earliest, to: today };
    return semester ? getSemesterWindow(semester, data, today) : { from: earliest, to: today };
  }, [range, semester, data, today]);

  const todoNames = useMemo(() => getTodoNames(sessions), [sessions]);
  const items: Item[] = useMemo(() => {
    const list: Item[] = scope === TODO_SCOPE ? [] : courses
      .filter((course) => !scope || scope === COURSES_SCOPE || course.semesterId === scope)
      .map((course) => ({ id: course.id, name: course.name, color: course.color, semesterId: course.semesterId }));
    // To-dos (time not tied to any course) show with "all semesters and to-dos" and in their own scope,
    // but only when they have time in the window - an old one-off would otherwise clutter the chips.
    if (!scope || scope === TODO_SCOPE) {
      [...todoNames].filter(([key]) => sumCourse(data.get(key), window.from, window.to) > 0)
        .sort(([a], [b]) => sumCourse(data.get(b), window.from, window.to) - sumCourse(data.get(a), window.from, window.to))
        .forEach(([key, name], index) => list.push({ id: key, name, color: todoColors[index % todoColors.length], semesterId: null }));
    }
    return list;
  }, [courses, scope, data, window, todoNames, todoColors]);

  const allIds = items.map((item) => item.id);
  const shownItems = items.filter((item) => !hidden.has(item.id));
  const shownIds = shownItems.map((item) => item.id);
  const dates = useMemo(() => Array.from({ length: Math.max(0, daysBetween(window.from, window.to)) + 1 }, (_, i) => addDays(window.from, i)), [window]);

  const summaries = useMemo(() => items.map((item) => summarizeCourse(data, item.id, item.name, item.color, window.from, window.to)), [items, data, window]);
  const summaryById = new Map<string, CourseSummary>(summaries.map((summary) => [summary.id, summary]));
  const shownSummaries = summaries.filter((summary) => !hidden.has(summary.id));
  const totalMinutes = shownSummaries.reduce((sum, summary) => sum + summary.minutes, 0);
  const scopeMinutes = summaries.reduce((sum, summary) => sum + summary.minutes, 0);

  const totalCurve = buildWindowCurve(data, allIds, window.from, window.to);
  const courseCurves = useMemo(() => new Map<string, CurvePoint[]>(items.map((item) => [item.id, buildWindowCurve(data, [item.id], window.from, window.to)])), [items, data, window]);

  const activeDaySet = new Set<string>();
  for (const id of shownIds) for (const [date, minutes] of data.get(id) ?? []) if (minutes > 0 && date >= window.from && date <= window.to) activeDaySet.add(date);
  const dayTotals = new Map<string, number>();
  for (const id of shownIds) for (const [date, minutes] of data.get(id) ?? []) if (date >= window.from && date <= window.to) dayTotals.set(date, (dayTotals.get(date) ?? 0) + minutes);
  let bestDay: [string, number] | null = null;
  for (const entry of dayTotals) if (!bestDay || entry[1] > bestDay[1]) bestDay = entry;
  let streak = 0;
  let cursor = dayTotals.has(window.to) ? window.to : addDays(window.to, -1);
  while (dayTotals.has(cursor)) {
    streak += 1;
    cursor = addDays(cursor, -1);
  }
  const spanDays = dates.length || 1;

  function toggle(id: string) {
    setHidden((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  const soloOrAll = (id: string) => setHidden(hidden.size === allIds.length - 1 && !hidden.has(id) ? new Set() : new Set(allIds.filter((other) => other !== id)));

  const creditOf = (minutes: number) => minutesToCredits(minutes, hoursPerCredit);

  // ---- shared pieces -----------------------------------------------------------------------
  const chips = (
    <div className="wst-chips" role="group" aria-label="Courses">
      <div className="wst-chips-bar">
        <button type="button" className="wst-chips-toggle" aria-expanded={chipsOpen} onClick={() => setChipsOpen((open) => !open)}>
          <span aria-hidden="true">{chipsOpen ? "\u2212" : "+"}</span>{scope === TODO_SCOPE ? "To-dos" : "Courses"} · {shownIds.length} of {items.length} shown
        </button>
        {chipsOpen ? null : (
          <span className="wst-dots">
            {items.map((item) => (
              <button key={item.id} type="button" className={`wst-dot ${hidden.has(item.id) ? "" : "on"}`} style={{ "--wst-c": item.color } as React.CSSProperties} aria-pressed={!hidden.has(item.id)} aria-label={item.name} title={`${item.name} · ${formatHours(summaryById.get(item.id)?.minutes ?? 0)}h`} onClick={() => toggle(item.id)} onDoubleClick={() => soloOrAll(item.id)} />
            ))}
          </span>
        )}
        {items.length ? (
          <span className="wst-chip-tools">
            <button type="button" onClick={() => setHidden(new Set())}>all</button>
            <button type="button" onClick={() => setHidden(new Set(allIds))}>none</button>
          </span>
        ) : null}
      </div>
      {chipsOpen ? (
        <div className="wst-chip-list">
          {items.map((item) => {
            const on = !hidden.has(item.id);
            return (
              <button key={item.id} type="button" className={`wst-chip ${on ? "on" : ""}`} style={{ "--wst-c": item.color } as React.CSSProperties} aria-pressed={on} onClick={() => toggle(item.id)} onDoubleClick={() => soloOrAll(item.id)} title="Click to overlay · double-click to isolate">
                <i />{item.name}<small>{formatHours(summaryById.get(item.id)?.minutes ?? 0)}h</small>
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );

  const summaryStrip = (
    <div className="wst-strip">
      <div><span>Studied</span><b>{formatMinutes(totalMinutes)}</b><small>{shownIds.length} of {items.length} courses</small></div>
      <div><span>Credit worth</span><b>{formatCredits(creditOf(totalMinutes))} <em>ECTS</em></b><small>at {hoursPerCredit} h per credit</small></div>
      <div><span>Days studied</span><b>{activeDaySet.size}<em> / {spanDays}</em></b><small>{Math.round((activeDaySet.size / spanDays) * 100)}% of the window</small></div>
      <div><span>Best day</span><b>{bestDay ? formatMinutes(bestDay[1]) : "-"}</b><small>{bestDay ? monthDay(bestDay[0]) : "nothing yet"}</small></div>
      <div><span>Daily average</span><b>{formatMinutes(Math.round(totalMinutes / spanDays))}</b><small>{streak ? `${streak}-day streak now` : "no streak right now"}</small></div>
    </div>
  );

  const totalSeries: LineSeries = { id: "__total", label: semester ? "Semester total" : scope === TODO_SCOPE ? "To-do total" : "Total", color: "var(--wabi-vermilion)", values: totalCurve.map((point) => point.total), dashed: true, heavy: true };
  const courseSeries: LineSeries[] = shownItems.map((item) => ({ id: item.id, label: item.name, color: item.color, values: (courseCurves.get(item.id) ?? []).map((point) => point.total) }));
  const empty = scopeMinutes === 0;

  const inkView = (
    <>
      <div className="wst-card">
        <div className="wst-card-head"><h3>Hours over time</h3><span>Left axis hours · right axis credits · dashed line is everything in this {semester ? "semester" : "view"}</span></div>
        <LineChart dates={dates} series={[totalSeries, ...courseSeries]} hoursPerCredit={hoursPerCredit} />
      </div>
      <div className="wst-card">
        <div className="wst-card-head"><h3>Hours into credits</h3><span>One section is one credit ({hoursPerCredit} h) · bar length is what the course is worth</span></div>
        <div className="wst-steps">
          {summaries.map((summary) => {
            const target = credits[summary.id];
            const earned = creditOf(summary.minutes);
            // The bar is the course's credit worth (1 credit when none is set), cut into one section per credit;
            // it only grows past that once you have studied more than the course is worth.
            const span = Math.max(target ?? 1, earned);
            const sections = Array.from({ length: Math.ceil(span) - 1 }, (_, i) => i + 1).filter((mark) => mark < span);
            return (
              <div key={summary.id} className={`wst-step ${hidden.has(summary.id) ? "off" : ""}`} style={{ "--wst-c": summary.color } as React.CSSProperties}>
                <span className="wst-step-name">{summary.name}</span>
                <div className="wst-step-track" title={target ? `Worth ${target} ECTS` : "No credit value set: showing one credit"}>
                  <div className="wst-step-fill" style={{ width: `${(earned / span) * 100}%` }} />
                  {sections.map((mark) => <u key={mark} style={{ left: `${(mark / span) * 100}%` }} />)}
                  {target && earned > target ? <div className="wst-step-target" style={{ left: `${(target / span) * 100}%` }} /> : null}
                </div>
                <span className="wst-step-val"><b>{formatCredits(earned)}</b> / {formatCredits(target ?? 1)} ECTS · {formatHours(summary.minutes)}h</span>
              </div>
            );
          })}
        </div>
        {renderCreditEditor()}
      </div>
    </>
  );

  function renderCreditEditor() {
    return (
      <details className="wst-credit-edit">
        <summary>What is each course worth? (optional)</summary>
        <div>
          {items.map((item) => (
            <label key={item.id}><span>{item.name}</span><input type="number" min="0" step="0.5" value={credits[item.id] ?? ""} placeholder="ECTS" onChange={(event) => setCourseCredits(item.id, Number(event.target.value))} /></label>
          ))}
        </div>
      </details>
    );
  }

  // ---- Field Notebook: its own page, built from the notebook's ledger pieces ---------------------
  if (variant === "notebook") {
    const scopeLabel = semester ? semester.name : scope === TODO_SCOPE ? "To-dos" : scope === COURSES_SCOPE ? "All semesters" : "Everything";
    const codeOf = (name: string) => (name.replace(/[^A-Za-z0-9]/g, "").slice(0, 4) || "----").toUpperCase();
    return (
      <div className="wst-nb">
        <div className="wst-nb-bar">
          <p className="fn-stamp-line">{scopeLabel} · {monthDay(window.from)} – {monthDay(window.to)}</p>
          <div className="fn-view-switch">
            <span>Window</span>
            {([["semester", "Semester"], ["30", "30 d"], ["90", "90 d"], ["all", "All"]] as const).map(([id, label]) => (
              <button key={id} type="button" className={range === id ? "active" : ""} onClick={() => setRange(id)}>{label}</button>
            ))}
          </div>
          <label className="wst-nb-field"><span>Book</span>
            <select value={scope} onChange={(event) => { setScope(event.target.value); setHidden(new Set()); }}>
              <option value="">All semesters and to-dos</option>
              <option value={COURSES_SCOPE}>All semesters</option>
              <option value={TODO_SCOPE}>To-dos only</option>
              {semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
            </select>
          </label>
          <label className="wst-nb-field"><span>1 credit =</span>
            <input type="number" min="1" step="1" value={hoursPerCredit} onChange={(event) => setHoursPerCredit(Number(event.target.value))} aria-label="Hours per credit" /> <span>h</span>
          </label>
        </div>

        {empty ? <p className="fn-footer-note dim">Nothing studied in this window yet. Finish a timer session and it will be entered here.</p> : null}

        
            <section className="fn-pace-note wst-nb-pace">
            <p className="eyebrow">Pace ledger · {shownIds.length} of {items.length} overlaid</p>
            <div><strong>{formatHours(totalMinutes)}</strong><span>hours</span></div>
            <div><strong>{formatCredits(creditOf(totalMinutes))}</strong><span>ECTS worth</span></div>
            <div><strong>{activeDaySet.size}<small>/{spanDays}</small></strong><span>days studied</span></div>
            <div><strong>{formatMinutes(Math.round(totalMinutes / spanDays))}</strong><span>per day</span></div>
            <div><strong>{bestDay ? formatMinutes(bestDay[1]) : "-"}</strong><span>{bestDay ? `best · ${monthDay(bestDay[0])}` : "best day"}</span></div>
            <div><strong>{streak}<small> d</small></strong><span>streak</span></div>
          </section>

        <div className="wst-nb-grid">
          <main className="wst-nb-main">
            <div className="fn-section-rule">
              <span>Hours over time</span>
              <em>dashed = {semester ? "semester" : "all"} total · left hours · right ECTS</em>
            </div>
            <LineChart dates={dates} series={[totalSeries, ...courseSeries]} hoursPerCredit={hoursPerCredit} />
          </main>
          <aside className="wst-nb-margin">
            <section className="fn-margin-note">
              <span>Margin note</span>
              <p>{hoursPerCredit} hours of work make one credit. Write what a course is worth beside it and its row is ruled into that many credits.</p>
            </section>
          </aside>
        </div>

        <section className="wst-nb-side">
          <div className="fn-section-rule">
            <span>{scope === TODO_SCOPE ? "To-do ledger" : "Course ledger"}</span>
            <em>{shownIds.length} of {items.length} overlaid · click a row to overlay it · double-click to isolate</em>
          </div>
            <ul className="wst-nb-rows">
              {summaries.map((summary) => {
                const target = credits[summary.id];
                const earned = creditOf(summary.minutes);
                const span = Math.max(target ?? 1, earned);
                const on = !hidden.has(summary.id);
                return (
                  <li key={summary.id} className={on ? "" : "off"} style={{ "--fn-course": summary.color, "--wst-c": summary.color } as React.CSSProperties}>
                    <button type="button" className="wst-nb-name" aria-pressed={on} onClick={() => toggle(summary.id)} onDoubleClick={() => soloOrAll(summary.id)} title="Click to overlay · double-click to isolate">
                      <span className={`fn-course-code ${on ? "on" : ""}`}>{codeOf(summary.name)}</span>
                      <span className="wst-nb-title">{summary.name}</span>
                      <i className="wst-nb-leader" aria-hidden="true" />
                      <b>{formatHours(summary.minutes)}h</b>
                    </button>
                    <div className="wst-nb-credit">
                      <div className="wst-nb-cells" title={target ? `Worth ${target} ECTS` : "No credit value set: one credit shown"}>
                        {Array.from({ length: Math.ceil(span - 1e-9) }, (_, i) => {
                          const length = Math.min(1, span - i);
                          const fill = Math.max(0, Math.min(1, (earned - i) / length));
                          return <u key={i} className={target && i >= target ? "over" : ""} style={{ flexGrow: length }}><s style={{ width: `${fill * 100}%` }} /></u>;
                        })}
                      </div>
                      <span className="wst-nb-ects"><b>{formatCredits(earned)}</b> / {formatCredits(target ?? 1)} ECTS</span>
                      <label className="wst-nb-worth">worth <input type="number" min="0" step="0.5" value={target ?? ""} placeholder="-" onChange={(event) => setCourseCredits(summary.id, Number(event.target.value))} aria-label={`${summary.name} credits`} /></label>
                    </div>
                  </li>
                );
              })}
              {items.length === 0 ? <li className="wst-nb-none">Nothing entered yet.</li> : null}
            </ul>
            {items.length ? (
              <div className="wst-nb-links">
                <button type="button" onClick={() => setHidden(new Set())}>overlay all</button>
                <button type="button" onClick={() => setHidden(new Set(allIds))}>clear</button>
              </div>
            ) : null}
        </section>
        <p className="fn-footer-note"><span>Kept on this device only</span><span>Last 12 months of sessions · breaks not counted</span></p>
      </div>
    );
  }

  return (
    <section className={modern ? "wst wst--modern panel-card design-card" : "wst"}>
      <header className="wst-head">
        <div>
          <p className={modern ? "eyebrow" : "wabi-eyebrow"}>{modern ? "Study statistics" : "Statistics · 統計"}</p>
          <h2 className="wst-title">{semester ? semester.name : scope === TODO_SCOPE ? "To-dos" : scope === COURSES_SCOPE ? "All semesters" : "Everything"}</h2>
          <p className="wst-sub">{monthDay(window.from)} – {monthDay(window.to)} · kept on this device only, never shared</p>
        </div>
      </header>

      <div className="wst-controls">
        <label>Semester
          <select value={scope} onChange={(event) => { setScope(event.target.value); setHidden(new Set()); }}>
            <option value="">All semesters and to-dos</option>
            <option value={COURSES_SCOPE}>All semesters</option>
            <option value={TODO_SCOPE}>To-dos only</option>
            {semesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className="wst-range" role="group" aria-label="Time window">
          {([["semester", "Semester"], ["30", "30 days"], ["90", "90 days"], ["all", "All time"]] as const).map(([id, label]) => (
            <button key={id} type="button" className={range === id ? "on" : ""} onClick={() => setRange(id)}>{label}</button>
          ))}
        </div>
        <label className="wst-hpc">1 credit =
          <input type="number" min="1" step="1" value={hoursPerCredit} onChange={(event) => setHoursPerCredit(Number(event.target.value))} aria-label="Hours per credit" /> h
        </label>
      </div>

      {chips}
      {empty ? <p className="wst-empty wst-empty-big">Nothing studied in this window yet. Finish a timer session and it will appear here.</p> : null}
      {summaryStrip}
      {inkView}
      <p className="wst-foot">Statistics use your saved sessions (the last 12 months). Breaks are not counted. To-dos are grouped by the title you gave the session.</p>
    </section>
  );
}
