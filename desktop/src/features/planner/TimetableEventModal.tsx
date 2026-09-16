import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getCourseTasks, getSemesterCourses } from "../../lib/metrics";
import { makeId } from "../../lib/storage";
import type { AppState, DailyTodo, TimetableEvent, TimetableEventKind } from "../../types";

export type TimetableModalPrefill = { date: string; time: string; semesterId: string | null };

export type TimetableModalTarget =
  | { mode: "create"; prefill: TimetableModalPrefill }
  | { mode: "edit"; entityKind: "event"; event: TimetableEvent }
  | { mode: "edit"; entityKind: "todo"; todo: DailyTodo };

export type TimetableModalState = TimetableModalTarget | null;

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setMessage: (message: string) => void;
  target: TimetableModalTarget;
  onClose: () => void;
  onOpenManageSemesters: () => void;
};

/**
 * Direct creation from the timetable grid is reserved for standalone Daily To-Dos - subject-bound
 * items (Lectures, Exercise Sessions, Exercise Sheets, and other course units) can only be
 * initialized and scheduled through the Manage Semesters portal, which is the single source of
 * truth for the stored TimetableEvent schema (see makeTimetableEvent). This modal still supports
 * editing an existing subject-bound occurrence in place, since that isn't a creation path.
 */
export function TimetableEventModal({ state, setState, setMessage, target, onClose, onOpenManageSemesters }: Props) {
  const isEdit = target.mode === "edit";
  const editingEvent = target.mode === "edit" && target.entityKind === "event" ? target.event : null;
  const editingTodo = target.mode === "edit" && target.entityKind === "todo" ? target.todo : null;
  const isSubjectItem = Boolean(editingEvent);

  const activeSemesters = useMemo(() => state.semesters.filter((semester) => !semester.archived), [state.semesters]);
  const initialSemesterId = editingEvent?.semesterId ?? null;
  const [semesterId] = useState(
    () => activeSemesters.find((semester) => semester.id === initialSemesterId)?.id ?? activeSemesters[0]?.id ?? "",
  );
  const semester = activeSemesters.find((item) => item.id === semesterId) ?? null;

  const courses = semester ? getSemesterCourses(state, semester.id) : [];
  const [courseId, setCourseId] = useState(editingEvent?.courseId ?? courses[0]?.id ?? "");
  const courseTasks = courseId ? getCourseTasks(state, courseId) : [];
  const [taskId, setTaskId] = useState(editingEvent?.taskId ?? courseTasks[0]?.id ?? "");
  const task = courseTasks.find((item) => item.id === taskId) ?? null;
  const [occurrenceKind, setOccurrenceKind] = useState<TimetableEventKind>(editingEvent?.kind ?? "occurrence");

  const [label, setLabel] = useState(editingEvent?.label ?? editingTodo?.title ?? "");
  const [date, setDate] = useState(editingEvent?.date ?? editingTodo?.date ?? (target.mode === "create" ? target.prefill.date : ""));
  const [time, setTime] = useState(editingEvent?.time ?? editingTodo?.time ?? (target.mode === "create" ? target.prefill.time : ""));
  const [endTime, setEndTime] = useState(editingEvent?.endTime ?? "");
  const [url, setUrl] = useState(editingEvent?.url ?? "");
  const [repeatWeekly, setRepeatWeekly] = useState(editingEvent?.repeatWeekly ?? true);
  const [notes, setNotes] = useState(editingTodo?.notes ?? "");

  const isSheetKind = occurrenceKind === "sheet-release" || occurrenceKind === "sheet-deadline";

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
        dailyTodos: current.dailyTodos.map((todo) => (todo.id === editingTodo.id ? { ...todo, title, date, time: time || null, notes } : todo)),
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

    // Direct creation only ever reaches here - it always produces a Daily To-Do.
    const title = label.trim();
    if (!title) {
      setMessage("Give this to-do a title first.");
      return;
    }
    const todo: DailyTodo = {
      id: makeId(),
      date,
      time: time || null,
      title,
      notes,
      completed: false,
      completedAt: null,
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, dailyTodos: [...current.dailyTodos, todo] }));
    onClose();
  }

  return (
    <div className="timetable-modal-backdrop" onMouseDown={onClose}>
      <section className="timetable-modal" role="dialog" aria-modal="true" aria-label={isSubjectItem ? "Edit subject task" : "New daily to-do"} onMouseDown={(event) => event.stopPropagation()}>
        <header className="timetable-modal-head">
          <strong>{isSubjectItem ? "Edit subject task" : isEdit ? "Edit to-do" : "New daily to-do"}</strong>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </header>

        <div className="timetable-modal-form">
          {isSubjectItem ? (
            <>
              <label className="field">
                <span>Semester</span>
                <select value={semesterId} disabled>
                  {activeSemesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              <label className="field">
                <span>Course</span>
                <select value={courseId} onChange={(event) => handleCourseChange(event.target.value)}>
                  <option value="">Select a course...</option>
                  {courses.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
              </label>

              {courseId ? (
                courseTasks.length ? (
                  <label className="field">
                    <span>Course task</span>
                    <select value={taskId} onChange={(event) => setTaskId(event.target.value)}>
                      {courseTasks.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
                    </select>
                    {task ? <span className="timetable-modal-subtype-badge">{task.subtype}</span> : null}
                  </label>
                ) : (
                  <p className="section-note">No course tasks yet — add one first.</p>
                )
              ) : null}

              {taskId ? (
                <label className="field">
                  <span>Occurrence</span>
                  <select value={occurrenceKind} onChange={(event) => setOccurrenceKind(event.target.value as TimetableEventKind)}>
                    <option value="occurrence">Occurrence</option>
                    <option value="sheet-release">Released</option>
                    <option value="sheet-deadline">Due</option>
                  </select>
                </label>
              ) : null}
            </>
          ) : null}

          <label className="field">
            <span>{isSubjectItem ? "Label" : "Title"}</span>
            <input
              value={label}
              onChange={(event) => setLabel(event.target.value)}
              placeholder={isSubjectItem ? (task?.title ?? "Label") : "Title"}
            />
          </label>

          <div className="timetable-modal-dates">
            <label className="field compact-field">
              <span>Date</span>
              <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
            </label>
            <label className="field compact-field">
              <span>{isSubjectItem ? "Time" : "Time (optional)"}</span>
              <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
            </label>
            {isSubjectItem && occurrenceKind === "occurrence" ? (
              <label className="field compact-field">
                <span>End time</span>
                <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
              </label>
            ) : null}
          </div>

          {isSubjectItem && isSheetKind ? (
            <label className="field">
              <span>Link</span>
              <input value={url} onChange={(event) => setUrl(event.target.value)} placeholder="https://..." />
            </label>
          ) : null}

          {!isSubjectItem ? (
            <label className="field">
              <span>Notes</span>
              <textarea value={notes} onChange={(event) => setNotes(event.target.value)} rows={2} />
            </label>
          ) : null}

          {isSubjectItem ? (
            <label className="timetable-modal-toggle">
              <input type="checkbox" checked={repeatWeekly} onChange={(event) => setRepeatWeekly(event.target.checked)} />
              <span>Repeat weekly until the semester ends</span>
            </label>
          ) : null}

          <button type="button" onClick={submit} disabled={isSubjectItem && !taskId}>{isEdit ? "Save changes" : "Create"}</button>

          {!isEdit ? (
            <button type="button" className="ghost-button timetable-modal-manage-link" onClick={onOpenManageSemesters}>
              Need to schedule a course item? Open Semester Manager
            </button>
          ) : null}
        </div>
      </section>
    </div>
  );
}
