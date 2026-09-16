import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCourseTasks, getSemesterCourses } from "../../lib/metrics";
import { makeTimetableEvent } from "../../lib/plannerSchedule";
import { makeId } from "../../lib/storage";
import type { AppState, DailyTodo, StudyUnit, TimetableEvent, TimetableEventKind } from "../../types";

export type TimetableModalPrefill = { date: string; time: string; semesterId: string | null };

export type TimetableModalTarget =
  | { mode: "create"; prefill: TimetableModalPrefill }
  | { mode: "edit"; entityKind: "event"; event: TimetableEvent }
  | { mode: "edit"; entityKind: "todo"; todo: DailyTodo };

export type TimetableModalState = TimetableModalTarget | null;

type ItemMode = "unit" | "study-unit" | "task";

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setMessage: (message: string) => void;
  target: TimetableModalTarget;
  onClose: () => void;
};

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
  const availableModes: ItemMode[] = semester ? (examPrep ? ["study-unit", "task"] : ["unit", "task"]) : ["task"];

  const initialItemMode: ItemMode = editingEvent ? "unit" : editingTodo ? "task" : availableModes[0];
  const [itemMode, setItemMode] = useState<ItemMode>(initialItemMode);
  const effectiveItemMode = isEdit ? itemMode : (availableModes.includes(itemMode) ? itemMode : availableModes[0]);

  const courses = semester ? getSemesterCourses(state, semester.id) : [];
  const [courseId, setCourseId] = useState(editingEvent?.courseId ?? courses[0]?.id ?? "");
  const courseTasks = courseId ? getCourseTasks(state, courseId) : [];
  const [taskId, setTaskId] = useState(editingEvent?.taskId ?? courseTasks[0]?.id ?? "");
  const task = courseTasks.find((item) => item.id === taskId) ?? null;
  const [occurrenceKind, setOccurrenceKind] = useState<TimetableEventKind>(editingEvent?.kind ?? "occurrence");

  const [label, setLabel] = useState(editingEvent?.label ?? editingTodo?.title ?? "");
  const [date, setDate] = useState(editingEvent?.date ?? editingTodo?.date ?? (target.mode === "create" ? target.prefill.date : ""));
  const [time, setTime] = useState(editingEvent?.time ?? (target.mode === "create" ? target.prefill.time : ""));
  const [endTime, setEndTime] = useState(editingEvent?.endTime ?? "");
  const [url, setUrl] = useState(editingEvent?.url ?? "");
  const [repeatWeekly, setRepeatWeekly] = useState(editingEvent?.repeatWeekly ?? true);
  const [studyUnitTitle, setStudyUnitTitle] = useState(editingEvent ? "" : label);
  const [notes, setNotes] = useState("");

  const isSheetKind = occurrenceKind === "sheet-release" || occurrenceKind === "sheet-deadline";

  function handleSemesterChange(nextSemesterId: string) {
    setSemesterId(nextSemesterId);
    const nextSemester = activeSemesters.find((item) => item.id === nextSemesterId) ?? null;
    const nextCourses = nextSemester ? getSemesterCourses(state, nextSemester.id) : [];
    const nextCourseId = nextCourses[0]?.id ?? "";
    setCourseId(nextCourseId);
    setTaskId(nextCourseId ? getCourseTasks(state, nextCourseId)[0]?.id ?? "" : "");
    const nextModes: ItemMode[] = nextSemester ? (nextSemester.phase === "exam-prep" ? ["study-unit", "task"] : ["unit", "task"]) : ["task"];
    if (!nextModes.includes(itemMode)) setItemMode(nextModes[0]);
  }

  function handleCourseChange(nextCourseId: string) {
    setCourseId(nextCourseId);
    setTaskId(nextCourseId ? getCourseTasks(state, nextCourseId)[0]?.id ?? "" : "");
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
      if (!courseId || !taskId) {
        setMessage("Pick a course and a course task first.");
        return;
      }
      setState((current) => ({
        ...current,
        timetableEvents: current.timetableEvents.map((event) =>
          event.id === editingEvent.id
            ? {
                ...event,
                courseId,
                taskId,
                kind: occurrenceKind,
                label: label.trim() || task?.title || "Item",
                date,
                time,
                endTime: occurrenceKind === "occurrence" ? (endTime || null) : null,
                repeatWeekly,
                url: isSheetKind ? (url.trim() || null) : null,
              }
            : event,
        ),
      }));
      onClose();
      return;
    }

    if (effectiveItemMode === "task") {
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

    if (effectiveItemMode === "study-unit") {
      if (!semester || !studyUnitTitle.trim()) {
        setMessage("A study unit needs a semester and a title.");
        return;
      }
      const unit: StudyUnit = {
        id: makeId(),
        semesterId: semester.id,
        courseId: courseId || null,
        date,
        title: studyUnitTitle.trim(),
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

    if (!semester || !courseId || !taskId) {
      setMessage("Pick a semester, course, and course task first.");
      return;
    }
    const event = makeTimetableEvent({
      id: makeId(),
      semesterId: semester.id,
      courseId,
      kind: occurrenceKind,
      taskId,
      label: label.trim() || task?.title || "Item",
      date,
      time,
      endTime: occurrenceKind === "occurrence" ? (endTime || null) : null,
      repeatWeekly,
      url: isSheetKind ? (url.trim() || null) : null,
    });
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
          {!isEdit && availableModes.length > 1 ? (
            <label className="field">
              <span>Item type</span>
              <select value={effectiveItemMode} onChange={(event) => setItemMode(event.target.value as ItemMode)}>
                {availableModes.map((mode) => (
                  <option key={mode} value={mode}>{mode === "unit" ? "Course task" : mode === "study-unit" ? "Study unit" : "Free task"}</option>
                ))}
              </select>
            </label>
          ) : null}

          {effectiveItemMode !== "task" ? (
            <label className="field">
              <span>Semester</span>
              <select value={semesterId} disabled={isEdit} onChange={(event) => handleSemesterChange(event.target.value)}>
                {activeSemesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}

          {effectiveItemMode !== "task" && semester ? (
            <label className="field">
              <span>Course</span>
              <select value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                <option value="">{effectiveItemMode === "study-unit" ? "No course" : "Select a course..."}</option>
                {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </label>
          ) : null}

          {effectiveItemMode === "unit" && courseId ? (
            courseTasks.length ? (
              <label className="field">
                <span>Course task</span>
                <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                  {courseTasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                </select>
              </label>
            ) : (
              <p className="section-note">No course tasks yet — add one first.</p>
            )
          ) : null}

          {effectiveItemMode === "unit" && taskId ? (
            <label className="field">
              <span>Occurrence</span>
              <select value={occurrenceKind} onChange={(event) => setOccurrenceKind(event.target.value as TimetableEventKind)}>
                <option value="occurrence">Occurrence</option>
                <option value="sheet-release">Released</option>
                <option value="sheet-deadline">Due</option>
              </select>
            </label>
          ) : null}

          <label className="field">
            <span>{effectiveItemMode === "task" ? "Task title" : effectiveItemMode === "study-unit" ? "Study unit title" : "Label"}</span>
            <input
              value={effectiveItemMode === "study-unit" ? studyUnitTitle : label}
              onChange={(event) => (effectiveItemMode === "study-unit" ? setStudyUnitTitle(event.target.value) : setLabel(event.target.value))}
              placeholder={effectiveItemMode === "unit" ? (task?.title ?? "Label") : "Title"}
            />
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
            {(effectiveItemMode === "study-unit" || (effectiveItemMode === "unit" && occurrenceKind === "occurrence")) ? (
              <label className="field compact-field">
                <span>End time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            ) : null}
          </div>

          {effectiveItemMode === "unit" && isSheetKind ? (
            <label className="field">
              <span>Link</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
          ) : null}

          {effectiveItemMode === "study-unit" ? (
            <label className="field">
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          ) : null}

          {effectiveItemMode === "unit" ? (
            <label className="timetable-modal-toggle">
              <input type="checkbox" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} />
              <span>Repeat weekly until the semester ends</span>
            </label>
          ) : null}

          <button type="button" onClick={submit} disabled={effectiveItemMode === "unit" && !taskId}>{isEdit ? "Save changes" : "Create"}</button>
        </div>
      </section>
    </div>
  );
}
