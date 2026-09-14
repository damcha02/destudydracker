import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getSemesterCourses } from "../../lib/metrics";
import { timetableEventKindLabels } from "../../lib/plannerSchedule";
import { makeId } from "../../lib/storage";
import type { AppState, DailyTodo, StudyUnit, TimetableEvent, TimetableEventKind } from "../../types";

export type TimetableModalPrefill = { date: string; time: string; semesterId: string | null };

export type TimetableModalTarget =
  | { mode: "create"; prefill: TimetableModalPrefill }
  | { mode: "edit"; entityKind: "event"; event: TimetableEvent }
  | { mode: "edit"; entityKind: "todo"; todo: DailyTodo };

export type TimetableModalState = TimetableModalTarget | null;

type ItemKind = TimetableEventKind | "study-unit" | "task";

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setMessage: (message: string) => void;
  target: TimetableModalTarget;
  onClose: () => void;
};

const kindLabels: Record<ItemKind, string> = {
  ...timetableEventKindLabels,
  "study-unit": "Study Unit",
  task: "To-Do Task",
};

const semesterPhaseKinds: ItemKind[] = ["lecture", "exercise-session", "sheet-release", "sheet-deadline", "task"];
const examPrepKinds: ItemKind[] = ["study-unit", "task"];

export function TimetableEventModal({ state, setState, setMessage, target, onClose }: Props) {
  const isEdit = target.mode === "edit";
  const editingEvent = target.mode === "edit" && target.entityKind === "event" ? target.event : null;
  const editingTodo = target.mode === "edit" && target.entityKind === "todo" ? target.todo : null;

  const activeSemesters = useMemo(() => state.semesters.filter((semester) => !semester.archived), [state.semesters]);
  const initialSemesterId = target.mode === "create" ? target.prefill.semesterId : (editingEvent?.semesterId ?? null);
  const [semesterId, setSemesterId] = useState(
    () => activeSemesters.find((semester) => semester.id === initialSemesterId)?.id ?? activeSemesters[0]?.id ?? "",
  );
  const semester = activeSemesters.find((item) => item.id === semesterId) ?? null;
  const examPrep = semester?.phase === "exam-prep";
  const availableKinds: ItemKind[] = semester ? (examPrep ? examPrepKinds : semesterPhaseKinds) : ["task"];

  const [kind, setKind] = useState<ItemKind>(editingEvent ? editingEvent.kind : editingTodo ? "task" : availableKinds[0]);
  const courses = semester ? getSemesterCourses(state, semester.id) : [];
  const [courseId, setCourseId] = useState(editingEvent?.courseId ?? courses[0]?.id ?? "");
  const [label, setLabel] = useState(editingEvent?.label ?? editingTodo?.title ?? "");
  const [date, setDate] = useState(editingEvent?.date ?? editingTodo?.date ?? (target.mode === "create" ? target.prefill.date : ""));
  const [time, setTime] = useState(editingEvent?.time ?? (target.mode === "create" ? target.prefill.time : ""));
  const [endTime, setEndTime] = useState(editingEvent?.endTime ?? "");
  const [url, setUrl] = useState(editingEvent?.url ?? "");
  const [repeatWeekly, setRepeatWeekly] = useState(editingEvent?.repeatWeekly ?? true);
  const [notes, setNotes] = useState("");

  const effectiveKind = isEdit ? kind : (availableKinds.includes(kind) ? kind : availableKinds[0]);

  function handleSemesterChange(nextSemesterId: string) {
    setSemesterId(nextSemesterId);
    const nextSemester = activeSemesters.find((item) => item.id === nextSemesterId) ?? null;
    const nextCourses = nextSemester ? getSemesterCourses(state, nextSemester.id) : [];
    setCourseId(nextCourses[0]?.id ?? "");
    const nextKinds: ItemKind[] = nextSemester ? (nextSemester.phase === "exam-prep" ? examPrepKinds : semesterPhaseKinds) : ["task"];
    if (!nextKinds.includes(kind)) setKind(nextKinds[0]);
  }

  function submit() {
    if (editingTodo) {
      const title = label.trim();
      if (!title) {
        setMessage("Give this task a title first.");
        return;
      }
      setState((current) => ({
        ...current,
        dailyTodos: current.dailyTodos.map((todo) => (todo.id === editingTodo.id ? { ...todo, title, date } : todo)),
      }));
      onClose();
      return;
    }

    if (editingEvent) {
      if (!courseId) {
        setMessage("Pick a course first.");
        return;
      }
      setState((current) => ({
        ...current,
        timetableEvents: current.timetableEvents.map((event) =>
          event.id === editingEvent.id
            ? {
                ...event,
                courseId,
                label: label.trim() || kindLabels[editingEvent.kind],
                date,
                time,
                endTime: editingEvent.kind === "lecture" || editingEvent.kind === "exercise-session" ? (endTime || null) : null,
                repeatWeekly,
                url: editingEvent.kind === "sheet-release" || editingEvent.kind === "sheet-deadline" ? (url.trim() || null) : null,
              }
            : event,
        ),
      }));
      onClose();
      return;
    }

    if (effectiveKind === "task") {
      const title = label.trim();
      if (!title) {
        setMessage("Give this task a title first.");
        return;
      }
      const todo: DailyTodo = {
        id: makeId(),
        date,
        title,
        completed: false,
        completedAt: null,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, dailyTodos: [...current.dailyTodos, todo] }));
      onClose();
      return;
    }

    if (effectiveKind === "study-unit") {
      if (!semester || !label.trim()) {
        setMessage("A study unit needs a semester and a title.");
        return;
      }
      const unit: StudyUnit = {
        id: makeId(),
        semesterId: semester.id,
        courseId: courseId || null,
        date,
        title: label.trim(),
        startTime: time || null,
        endTime: endTime || null,
        notes,
        completed: false,
        createdAt: new Date().toISOString(),
      };
      setState((current) => ({ ...current, studyUnits: [...current.studyUnits, unit] }));
      onClose();
      return;
    }

    if (!semester || !courseId) {
      setMessage("Pick a semester and a course first.");
      return;
    }
    const timetableKind = effectiveKind as TimetableEventKind;
    const isSheetKind = timetableKind === "sheet-release" || timetableKind === "sheet-deadline";
    const event: TimetableEvent = {
      id: makeId(),
      semesterId: semester.id,
      courseId,
      kind: timetableKind,
      label: label.trim() || kindLabels[effectiveKind],
      date,
      time,
      endTime: timetableKind === "lecture" || timetableKind === "exercise-session" ? (endTime || null) : null,
      repeatWeekly,
      url: isSheetKind ? (url.trim() || null) : null,
      completedOccurrences: [],
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, timetableEvents: [...current.timetableEvents, event] }));
    onClose();
  }

  return (
    <div className="timetable-modal-backdrop" onMouseDown={onClose}>
      <section className="timetable-modal" role="dialog" aria-modal="true" aria-label={isEdit ? "Edit planner item" : "Create planner item"} onMouseDown={(event) => event.stopPropagation()}>
        <header className="timetable-modal-head">
          <strong>{isEdit ? "Edit planner item" : "New planner item"}</strong>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </header>

        <div className="timetable-modal-form">
          <label className="field">
            <span>Kind</span>
            <select value={effectiveKind} disabled={isEdit} onChange={(event) => setKind(event.target.value as ItemKind)}>
              {(isEdit ? [effectiveKind] : availableKinds).map((item) => <option key={item} value={item}>{kindLabels[item]}</option>)}
            </select>
          </label>

          {effectiveKind !== "task" ? (
            <label className="field">
              <span>Semester</span>
              <select value={semesterId} disabled={isEdit} onChange={(event) => handleSemesterChange(event.target.value)}>
                {activeSemesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}

          {effectiveKind !== "task" && semester ? (
            <label className="field">
              <span>Course</span>
              <select value={courseId} onChange={(event) => setCourseId(event.target.value)}>
                <option value="">{effectiveKind === "study-unit" ? "No course" : "Select a course..."}</option>
                {courses.map((course) => <option key={course.id} value={course.id}>{course.name}</option>)}
              </select>
            </label>
          ) : null}

          <label className="field">
            <span>{effectiveKind === "task" ? "Task title" : effectiveKind === "study-unit" ? "Study unit title" : "Label"}</span>
            <input value={label} onChange={(event) => setLabel(event.target.value)} placeholder={kindLabels[effectiveKind]} />
          </label>

          <div className="timetable-modal-dates">
            <label className="field compact-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>Time</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            {effectiveKind === "lecture" || effectiveKind === "exercise-session" || effectiveKind === "study-unit" ? (
              <label className="field compact-field">
                <span>End time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            ) : null}
          </div>

          {effectiveKind === "sheet-release" || effectiveKind === "sheet-deadline" ? (
            <label className="field">
              <span>Link</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
          ) : null}

          {effectiveKind === "study-unit" ? (
            <label className="field">
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          ) : null}

          {effectiveKind === "lecture" || effectiveKind === "exercise-session" || effectiveKind === "sheet-release" || effectiveKind === "sheet-deadline" ? (
            <label className="timetable-modal-toggle">
              <input type="checkbox" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} />
              <span>Repeat weekly until the semester ends</span>
            </label>
          ) : null}

          <button type="button" onClick={submit}>{isEdit ? "Save changes" : "Create"}</button>
        </div>
      </section>
    </div>
  );
}
