import { useEffect, useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { formatDate, getCourseTasks, getSemesterCourses } from "../../lib/metrics";
import { getSemesterWeekNumber, makeTimetableEvent } from "../../lib/plannerSchedule";
import { makeId } from "../../lib/storage";
import type { AppState, Course, Holiday, Semester, Task, TimetableEvent } from "../../types";

const timetableEventKindLabel: Record<TimetableEvent["kind"], string> = {
  occurrence: "Occurrence",
  "sheet-release": "Released",
  "sheet-deadline": "Due",
};

type View = "main" | "wizard" | "archive";

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setMessage: (message: string) => void;
  onClose: () => void;
  onDeleteWithUndo: (label: string, updater: (current: AppState) => AppState) => void;
  onRemoveSemester: (semesterId: string) => void;
  onRemoveCourse: (courseId: string) => void;
  onRemoveTask: (taskId: string) => void;
  onAddTask: (semesterId: string, courseId: string) => void;
  onEditTask: (task: Task) => void;
  initialSemesterId?: string | null;
  initialCourseId?: string | null;
};

export function ManageSemestersModal({
  state, setState, setMessage, onClose, onDeleteWithUndo,
  onRemoveSemester, onRemoveCourse, onRemoveTask, onAddTask, onEditTask,
  initialSemesterId, initialCourseId,
}: Props) {
  const activeSemesters = useMemo(() => state.semesters.filter((semester) => !semester.archived), [state.semesters]);
  const archivedSemesters = useMemo(() => state.semesters.filter((semester) => semester.archived), [state.semesters]);
  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  const [view, setView] = useState<View>("main");
  const [semesterId, setSemesterId] = useState(() => initialSemesterId ?? activeSemesters[0]?.id ?? "");
  const semester = activeSemesters.find((item) => item.id === semesterId) ?? null;

  const [renaming, setRenaming] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [startDraft, setStartDraft] = useState("");
  const [endDraft, setEndDraft] = useState("");
  const [removeConfirm, setRemoveConfirm] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);

  const [holidayDraft, setHolidayDraft] = useState({ label: "", startDate: "", endDate: "" });

  const [addingCourse, setAddingCourse] = useState(false);
  const [courseDraft, setCourseDraft] = useState({ name: "", color: "#8fb4ff", externalUrl: "" });
  const [editingCourseId, setEditingCourseId] = useState<string | null>(null);
  const [courseEditDraft, setCourseEditDraft] = useState({ name: "", color: "#8fb4ff", externalUrl: "" });
  const [courseRemoveConfirm, setCourseRemoveConfirm] = useState<string | null>(null);
  const [taskRemoveConfirm, setTaskRemoveConfirm] = useState<string | null>(null);
  const [schedulingTaskId, setSchedulingTaskId] = useState<string | null>(null);
  const [scheduleDraft, setScheduleDraft] = useState({
    date: today, time: "10:00", endTime: "", repeatWeekly: true,
    releaseDate: today, releaseTime: "20:00", releaseWeekly: true,
    dueDate: today, dueTime: "23:59", dueWeekly: true,
    sheetUrl: "",
  });

  const [editingEventId, setEditingEventId] = useState<string | null>(null);
  const [eventEditDraft, setEventEditDraft] = useState({ date: "", time: "", endTime: "", repeatWeekly: true });
  const [eventRemoveConfirm, setEventRemoveConfirm] = useState<string | null>(null);

  function startEditEvent(event: TimetableEvent) {
    setSchedulingTaskId(null);
    setEditingEventId(event.id);
    setEventEditDraft({ date: event.date, time: event.time, endTime: event.endTime ?? "", repeatWeekly: event.repeatWeekly });
  }

  function cancelEditEvent() {
    setEditingEventId(null);
  }

  function saveEditEvent() {
    if (!editingEventId || !eventEditDraft.date || !eventEditDraft.time) {
      setMessage("Pick a date and time first.");
      return;
    }
    setState((current) => ({
      ...current,
      timetableEvents: current.timetableEvents.map((event) =>
        event.id === editingEventId
          ? { ...event, date: eventEditDraft.date, time: eventEditDraft.time, endTime: eventEditDraft.endTime || null, repeatWeekly: eventEditDraft.repeatWeekly }
          : event,
      ),
    }));
    setEditingEventId(null);
    setMessage("Schedule updated.");
  }

  function removeScheduledEvent(eventId: string) {
    const event = state.timetableEvents.find((item) => item.id === eventId);
    onDeleteWithUndo(`"${event?.label ?? "Item"}" removed`, (current) => ({ ...current, timetableEvents: current.timetableEvents.filter((item) => item.id !== eventId) }));
    setEventRemoveConfirm(null);
    if (editingEventId === eventId) setEditingEventId(null);
  }

  const courses = semester ? getSemesterCourses(state, semester.id) : [];
  const weekNumber = semester ? getSemesterWeekNumber(semester, today) : null;
  const semesterHolidays = semester ? state.holidays.filter((holiday) => holiday.semesterId === semester.id) : [];

  function startEditCourse(course: Course) {
    setEditingCourseId(course.id);
    setCourseEditDraft({ name: course.name, color: course.color, externalUrl: course.externalUrl ?? "" });
  }

  useEffect(() => {
    if (!initialCourseId) return;
    const course = state.courses.find((item) => item.id === initialCourseId);
    if (!course) return;
    if (course.semesterId !== semesterId) setSemesterId(course.semesterId);
    startEditCourse(course);
    // Only ever act on the initial trigger - subsequent re-renders shouldn't re-open this.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialCourseId]);

  function startRename() {
    if (!semester) return;
    setNameDraft(semester.name);
    setStartDraft(semester.startDate ?? "");
    setEndDraft(semester.endDate ?? "");
    setRenaming(true);
  }

  function saveRename() {
    if (!semester || !nameDraft.trim()) {
      setMessage("Give the semester a name first.");
      return;
    }
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) =>
        item.id === semester.id ? { ...item, name: nameDraft.trim(), startDate: startDraft || null, endDate: endDraft || null } : item,
      ),
    }));
    setRenaming(false);
  }

  function setPhase(phase: Semester["phase"]) {
    if (!semester) return;
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) => (item.id === semester.id ? { ...item, phase } : item)),
    }));
    setMessage(phase === "exam-prep" ? "Switched to Exam Prep." : "Switched back to Semester phase.");
  }

  function archiveSemester() {
    if (!semester) return;
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) =>
        item.id === semester.id ? { ...item, archived: true, archivedAt: new Date().toISOString() } : item,
      ),
    }));
    setArchiveConfirm(false);
    setMessage(`${semester.name} archived.`);
    setSemesterId(activeSemesters.find((item) => item.id !== semester.id)?.id ?? "");
  }

  function unarchiveSemester(id: string) {
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) => (item.id === id ? { ...item, archived: false, archivedAt: null } : item)),
    }));
    setMessage("Semester restored to active semesters.");
  }

  function addHoliday() {
    if (!semester || !holidayDraft.label.trim() || !holidayDraft.startDate || !holidayDraft.endDate) {
      setMessage("A holiday needs a label, start date, and end date.");
      return;
    }
    const holiday: Holiday = {
      id: makeId(),
      semesterId: semester.id,
      label: holidayDraft.label.trim(),
      startDate: holidayDraft.startDate,
      endDate: holidayDraft.endDate < holidayDraft.startDate ? holidayDraft.startDate : holidayDraft.endDate,
      createdAt: new Date().toISOString(),
    };
    setState((current) => ({ ...current, holidays: [...current.holidays, holiday] }));
    setHolidayDraft({ label: "", startDate: "", endDate: "" });
  }

  function removeHoliday(holidayId: string) {
    setState((current) => ({ ...current, holidays: current.holidays.filter((holiday) => holiday.id !== holidayId) }));
  }

  function addCourse() {
    if (!semester || !courseDraft.name.trim()) {
      setMessage("Give the subject a name first.");
      return;
    }
    const course: Course = {
      id: makeId(),
      semesterId: semester.id,
      name: courseDraft.name.trim(),
      color: courseDraft.color,
      targetGrade: 4,
      createdAt: new Date().toISOString(),
      externalUrl: courseDraft.externalUrl.trim() || null,
    };
    setState((current) => ({ ...current, courses: [...current.courses, course] }));
    setCourseDraft({ name: "", color: "#8fb4ff", externalUrl: "" });
    setAddingCourse(false);
    setMessage(`${course.name} added.`);
  }

  function saveEditCourse() {
    if (!editingCourseId || !courseEditDraft.name.trim()) {
      setMessage("Give the subject a name first.");
      return;
    }
    setState((current) => ({
      ...current,
      courses: current.courses.map((course) =>
        course.id === editingCourseId
          ? { ...course, name: courseEditDraft.name.trim(), color: courseEditDraft.color, externalUrl: courseEditDraft.externalUrl.trim() || null }
          : course,
      ),
    }));
    setEditingCourseId(null);
  }

  /** Used for every non-Sheet subtype (Lecture/Session/Other); Sheet units go through scheduleSheet below instead. */
  function scheduleTask(course: Course, task: Task) {
    if (!semester || !scheduleDraft.date || !scheduleDraft.time) {
      setMessage("Pick a date and time first.");
      return;
    }
    const event = makeTimetableEvent({
      id: makeId(),
      semesterId: semester.id,
      courseId: course.id,
      kind: "occurrence",
      taskId: task.id,
      label: task.title,
      date: scheduleDraft.date,
      time: scheduleDraft.time,
      endTime: scheduleDraft.endTime || null,
      repeatWeekly: scheduleDraft.repeatWeekly,
    });
    setState((current) => ({ ...current, timetableEvents: [...current.timetableEvents, event] }));
    setSchedulingTaskId(null);
    setMessage(`${task.title} scheduled.`);
  }

  /**
   * Sheet-subtype tasks get a dedicated release + due scheduler instead of the generic
   * kind-dropdown flow: one submit creates both timetable events at once. Both share the task's
   * own title/taskId (so they always inherit the same course color via courseId at render time)
   * and the same URL, and each is independently checkable off via the normal per-occurrence
   * completedOccurrences logic - no special-casing needed there since both are ordinary events.
   */
  function scheduleSheet(course: Course, task: Task) {
    if (!semester || !scheduleDraft.releaseDate || !scheduleDraft.releaseTime || !scheduleDraft.dueDate || !scheduleDraft.dueTime) {
      setMessage("Pick a release and due date/time first.");
      return;
    }
    const url = scheduleDraft.sheetUrl.trim() || null;
    const createdAt = new Date().toISOString();
    const releaseEvent = makeTimetableEvent({
      id: makeId(), semesterId: semester.id, courseId: course.id, taskId: task.id,
      kind: "sheet-release", label: task.title,
      date: scheduleDraft.releaseDate, time: scheduleDraft.releaseTime,
      repeatWeekly: scheduleDraft.releaseWeekly, url, createdAt,
    });
    const dueEvent = makeTimetableEvent({
      id: makeId(), semesterId: semester.id, courseId: course.id, taskId: task.id,
      kind: "sheet-deadline", label: task.title,
      date: scheduleDraft.dueDate, time: scheduleDraft.dueTime,
      repeatWeekly: scheduleDraft.dueWeekly, url, createdAt,
    });
    setState((current) => ({ ...current, timetableEvents: [...current.timetableEvents, releaseEvent, dueEvent] }));
    setSchedulingTaskId(null);
    setMessage(`${task.title} scheduled - release and due added.`);
  }

  function submitWizard(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);
    const name = String(formData.get("name") ?? "").trim();
    const startDate = String(formData.get("startDate") ?? "") || null;
    const endDate = String(formData.get("endDate") ?? "") || null;
    if (!name) {
      setMessage("Give the semester a name first.");
      return;
    }
    const courseNames = formData.getAll("courseName").map((value) => String(value).trim());
    const courseUrls = formData.getAll("courseUrl").map((value) => String(value).trim());

    const newSemester: Semester = {
      id: makeId(),
      name,
      createdAt: new Date().toISOString(),
      startDate,
      endDate,
      phase: "semester",
      archived: false,
      archivedAt: null,
    };
    const newCourses: Course[] = courseNames
      .map((courseName, index) => ({ courseName, url: courseUrls[index] ?? "" }))
      .filter((entry) => entry.courseName)
      .map((entry) => ({
        id: makeId(),
        semesterId: newSemester.id,
        name: entry.courseName,
        color: "#8fb4ff",
        targetGrade: 4,
        createdAt: new Date().toISOString(),
        externalUrl: entry.url || null,
      }));

    setState((current) => ({
      ...current,
      semesters: [...current.semesters, newSemester],
      courses: [...current.courses, ...newCourses],
    }));
    setSemesterId(newSemester.id);
    setView("main");
    setMessage(`${newSemester.name} set up with ${newCourses.length} subject${newCourses.length === 1 ? "" : "s"}. Add course tasks below to start scheduling.`);
  }

  return createPortal(
    <div className="timetable-modal-backdrop manage-semesters-backdrop" onMouseDown={onClose}>
      <section className="timetable-modal manage-semesters-modal" role="dialog" aria-modal="true" aria-label="Manage semesters" onMouseDown={(event) => event.stopPropagation()}>
        <header className="timetable-modal-head">
          <strong>Manage Semesters</strong>
          <button type="button" className="ghost-button" onClick={onClose}>Close</button>
        </header>

        {view === "wizard" ? (
          <form onSubmit={submitWizard} className="timetable-modal-form">
            <button type="button" className="ghost-button" onClick={() => setView("main")}>&larr; Back</button>
            <label className="field">
              <span>Name</span>
              <input name="name" placeholder="Winter Semester 2026/2027" required />
            </label>
            <div className="timetable-modal-dates">
              <label className="field compact-field">
                <span>Start date</span>
                <input name="startDate" type="date" />
              </label>
              <label className="field compact-field">
                <span>End date</span>
                <input name="endDate" type="date" />
              </label>
            </div>
            <p className="section-note">Add subjects (optional link to the course page or LMS).</p>
            {[0, 1, 2, 3].map((index) => (
              <div key={index} className="timetable-modal-course-row">
                <input name="courseName" placeholder={`Subject ${index + 1} name`} />
                <input name="courseUrl" placeholder="https://... (optional)" />
              </div>
            ))}
            <button type="submit">Create</button>
          </form>
        ) : view === "archive" ? (
          <div className="timetable-modal-form">
            <button type="button" className="ghost-button" onClick={() => setView("main")}>&larr; Back</button>
            <div className="stack-list compact">
              {archivedSemesters.length ? archivedSemesters.map((item) => {
                const archivedCourses = state.courses.filter((course) => course.semesterId === item.id);
                const archivedTasks = state.tasks.filter((task) => task.semesterId === item.id);
                return (
                  <div key={item.id} className="overview-row detailed-overview">
                    <div>
                      <strong>{item.name}</strong>
                      <p className="section-note">
                        {item.startDate ? formatDate(item.startDate) : "No start date"} – {item.endDate ? formatDate(item.endDate) : "No end date"} · archived {item.archivedAt ? formatDate(item.archivedAt.slice(0, 10)) : ""}
                      </p>
                      <p className="section-note">{archivedCourses.length} subjects · {archivedTasks.length} tasks</p>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => unarchiveSemester(item.id)}>Restore</button>
                  </div>
                );
              }) : <p className="empty-copy">Nothing archived yet.</p>}
            </div>
          </div>
        ) : (
          <div className="timetable-modal-form manage-semesters-main">
            <div className="manage-semesters-toolbar">
              <select value={semesterId} onChange={(event) => setSemesterId(event.target.value)}>
                {activeSemesters.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
              <button type="button" className="ghost-button small-button" onClick={() => setView("wizard")}>+ New</button>
              <button type="button" className="ghost-button small-button" onClick={() => setView("archive")}>Archived ({archivedSemesters.length})</button>
            </div>

            {semester ? (
              <>
                <div className="manage-semesters-summary">
                  <span className="semester-phase-pill">{semester.phase === "exam-prep" ? "Exam Prep" : "Active"}</span>
                  <span>{weekNumber ? `Week ${weekNumber}` : semester.startDate ? "Not started yet" : "No start date"}</span>
                  {!renaming ? (
                    <>
                      {semester.phase === "semester" ? (
                        <button type="button" className="ghost-button small-button" onClick={() => setPhase("exam-prep")}>End</button>
                      ) : (
                        <button type="button" className="ghost-button small-button" onClick={() => setPhase("semester")}>Resume</button>
                      )}
                      <button type="button" className="ghost-button small-button" onClick={startRename}>Edit</button>
                      {archiveConfirm ? (
                        <span className="semester-menu-confirm inline">
                          <span>Archive?</span>
                          <button type="button" className="mini-danger" onClick={archiveSemester}>Yes</button>
                          <button type="button" className="ghost-button small-button" onClick={() => setArchiveConfirm(false)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="ghost-button small-button" onClick={() => setArchiveConfirm(true)}>Archive</button>
                      )}
                      {removeConfirm ? (
                        <span className="semester-menu-confirm inline">
                          <span>Delete permanently?</span>
                          <button type="button" className="mini-danger" onClick={() => onRemoveSemester(semester.id)}>Yes</button>
                          <button type="button" className="ghost-button small-button" onClick={() => setRemoveConfirm(false)}>Cancel</button>
                        </span>
                      ) : (
                        <button type="button" className="ghost-button small-button danger" onClick={() => setRemoveConfirm(true)}>Remove</button>
                      )}
                    </>
                  ) : (
                    <div className="timetable-modal-dates">
                      <input value={nameDraft} onChange={(event) => setNameDraft(event.target.value)} placeholder="Name" />
                      <label className="field compact-field">
                        <span>Start</span>
                        <input type="date" value={startDraft} onChange={(event) => setStartDraft(event.target.value)} />
                      </label>
                      <label className="field compact-field">
                        <span>End</span>
                        <input type="date" value={endDraft} onChange={(event) => setEndDraft(event.target.value)} />
                      </label>
                      <button type="button" onClick={saveRename}>Save</button>
                      <button type="button" className="ghost-button" onClick={() => setRenaming(false)}>Cancel</button>
                    </div>
                  )}
                </div>

                <details className="manage-semesters-holidays">
                  <summary>Holidays &amp; breaks ({semesterHolidays.length})</summary>
                  <div className="timetable-modal-dates">
                    <input value={holidayDraft.label} onChange={(event) => setHolidayDraft((current) => ({ ...current, label: event.target.value }))} placeholder="Winter break" />
                    <label className="field compact-field">
                      <span>Start</span>
                      <input type="date" value={holidayDraft.startDate} onChange={(event) => setHolidayDraft((current) => ({ ...current, startDate: event.target.value }))} />
                    </label>
                    <label className="field compact-field">
                      <span>End</span>
                      <input type="date" value={holidayDraft.endDate} onChange={(event) => setHolidayDraft((current) => ({ ...current, endDate: event.target.value }))} />
                    </label>
                    <button type="button" onClick={addHoliday}>Add</button>
                  </div>
                  <div className="stack-list compact">
                    {semesterHolidays.map((holiday) => (
                      <div key={holiday.id} className="overview-row">
                        <span>{holiday.label} · {formatDate(holiday.startDate)} – {formatDate(holiday.endDate)}</span>
                        <button type="button" className="mini-danger" onClick={() => removeHoliday(holiday.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                </details>

                <div className="manage-semesters-subjects">
                  <div className="manage-semesters-subjects-head">
                    <strong>Subjects</strong>
                    <button type="button" className="ghost-button small-button" onClick={() => setAddingCourse((current) => !current)}>{addingCourse ? "Cancel" : "+ New"}</button>
                  </div>

                  {addingCourse ? (
                    <div className="timetable-modal-course-row">
                      <input value={courseDraft.name} onChange={(event) => setCourseDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Subject name" />
                      <input type="color" value={courseDraft.color} onChange={(event) => setCourseDraft((current) => ({ ...current, color: event.target.value }))} />
                      <input value={courseDraft.externalUrl} onChange={(event) => setCourseDraft((current) => ({ ...current, externalUrl: event.target.value }))} placeholder="https://... (optional)" />
                      <button type="button" onClick={addCourse}>Add</button>
                    </div>
                  ) : null}

                  <div className="stack-list compact">
                    {courses.map((course) => {
                      const tasks = getCourseTasks(state, course.id);
                      return (
                        <div key={course.id} className="manage-semesters-subject-row">
                          {editingCourseId === course.id ? (
                            <div className="timetable-modal-course-row">
                              <input value={courseEditDraft.name} onChange={(event) => setCourseEditDraft((current) => ({ ...current, name: event.target.value }))} />
                              <input type="color" value={courseEditDraft.color} onChange={(event) => setCourseEditDraft((current) => ({ ...current, color: event.target.value }))} />
                              <input value={courseEditDraft.externalUrl} onChange={(event) => setCourseEditDraft((current) => ({ ...current, externalUrl: event.target.value }))} placeholder="https://..." />
                              <button type="button" onClick={saveEditCourse}>Save</button>
                              <button type="button" className="ghost-button" onClick={() => setEditingCourseId(null)}>Cancel</button>
                            </div>
                          ) : (
                            <div className="overview-row">
                              <span><span className="course-chip" style={{ background: course.color }} /> {course.name}</span>
                              <span className="manage-semesters-subject-actions">
                                <button type="button" className="ghost-button small-button" onClick={() => startEditCourse(course)}>Edit</button>
                                {courseRemoveConfirm === course.id ? (
                                  <>
                                    <button type="button" className="mini-danger" onClick={() => { onRemoveCourse(course.id); setCourseRemoveConfirm(null); }}>Confirm</button>
                                    <button type="button" className="ghost-button small-button" onClick={() => setCourseRemoveConfirm(null)}>Cancel</button>
                                  </>
                                ) : (
                                  <button type="button" className="ghost-button small-button danger" onClick={() => setCourseRemoveConfirm(course.id)}>Remove</button>
                                )}
                              </span>
                            </div>
                          )}

                          <div className="manage-semesters-units">
                            {tasks.map((task) => (
                              <div key={task.id} className="manage-semesters-unit-row">
                                <span className="manage-semesters-unit-label">{task.title}</span>
                                <span className="section-note">{task.completedUnits}/{task.totalUnits} {task.unitLabel}</span>
                                <button type="button" className="ghost-button small-button" onClick={() => setSchedulingTaskId((current) => (current === task.id ? null : task.id))}>Schedule</button>
                                <button type="button" className="ghost-button small-button" onClick={() => onEditTask(task)}>Edit</button>
                                {taskRemoveConfirm === task.id ? (
                                  <>
                                    <button type="button" className="mini-danger" onClick={() => { onRemoveTask(task.id); setTaskRemoveConfirm(null); }}>Confirm</button>
                                    <button type="button" className="ghost-button small-button" onClick={() => setTaskRemoveConfirm(null)}>Cancel</button>
                                  </>
                                ) : (
                                  <button type="button" className="ghost-button small-button danger" onClick={() => setTaskRemoveConfirm(task.id)}>Delete</button>
                                )}
                                {schedulingTaskId === task.id && task.subtype === "Sheet" ? (
                                  <div className="manage-semesters-schedule-row manage-semesters-sheet-schedule">
                                    <div className="manage-semesters-sheet-schedule-section">
                                      <span className="section-note">Release</span>
                                      <input type="date" value={scheduleDraft.releaseDate} onChange={(event) => setScheduleDraft((current) => ({ ...current, releaseDate: event.target.value }))} />
                                      <input type="time" value={scheduleDraft.releaseTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, releaseTime: event.target.value }))} />
                                      <label className="timetable-modal-toggle compact">
                                        <input type="checkbox" checked={scheduleDraft.releaseWeekly} onChange={(event) => setScheduleDraft((current) => ({ ...current, releaseWeekly: event.target.checked }))} />
                                        <span>Weekly</span>
                                      </label>
                                    </div>
                                    <div className="manage-semesters-sheet-schedule-section">
                                      <span className="section-note">Due</span>
                                      <input type="date" value={scheduleDraft.dueDate} onChange={(event) => setScheduleDraft((current) => ({ ...current, dueDate: event.target.value }))} />
                                      <input type="time" value={scheduleDraft.dueTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, dueTime: event.target.value }))} />
                                      <label className="timetable-modal-toggle compact">
                                        <input type="checkbox" checked={scheduleDraft.dueWeekly} onChange={(event) => setScheduleDraft((current) => ({ ...current, dueWeekly: event.target.checked }))} />
                                        <span>Weekly</span>
                                      </label>
                                    </div>
                                    <input value={scheduleDraft.sheetUrl} onChange={(event) => setScheduleDraft((current) => ({ ...current, sheetUrl: event.target.value }))} placeholder="https://... (optional, shared by both)" />
                                    <button type="button" onClick={() => scheduleSheet(course, task)}>Add release + due to timetable</button>
                                  </div>
                                ) : schedulingTaskId === task.id ? (
                                  <div className="manage-semesters-schedule-row">
                                    <input type="date" value={scheduleDraft.date} onChange={(event) => setScheduleDraft((current) => ({ ...current, date: event.target.value }))} />
                                    <input type="time" value={scheduleDraft.time} onChange={(event) => setScheduleDraft((current) => ({ ...current, time: event.target.value }))} />
                                    <input type="time" value={scheduleDraft.endTime} onChange={(event) => setScheduleDraft((current) => ({ ...current, endTime: event.target.value }))} placeholder="End" />
                                    <label className="timetable-modal-toggle compact">
                                      <input type="checkbox" checked={scheduleDraft.repeatWeekly} onChange={(event) => setScheduleDraft((current) => ({ ...current, repeatWeekly: event.target.checked }))} />
                                      <span>Weekly</span>
                                    </label>
                                    <button type="button" onClick={() => scheduleTask(course, task)}>Add to timetable</button>
                                  </div>
                                ) : null}

                                {state.timetableEvents.filter((event) => event.taskId === task.id).length ? (
                                  <div className="manage-semesters-scheduled-list">
                                    {state.timetableEvents
                                      .filter((event) => event.taskId === task.id)
                                      .sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time))
                                      .map((event) => (
                                        editingEventId === event.id ? (
                                          <div key={event.id} className="manage-semesters-schedule-row manage-semesters-scheduled-edit-row">
                                            <input type="date" value={eventEditDraft.date} onChange={(edit) => setEventEditDraft((current) => ({ ...current, date: edit.target.value }))} />
                                            <input type="time" value={eventEditDraft.time} onChange={(edit) => setEventEditDraft((current) => ({ ...current, time: edit.target.value }))} />
                                            <input type="time" value={eventEditDraft.endTime} onChange={(edit) => setEventEditDraft((current) => ({ ...current, endTime: edit.target.value }))} placeholder="End" />
                                            <label className="timetable-modal-toggle compact">
                                              <input type="checkbox" checked={eventEditDraft.repeatWeekly} onChange={(edit) => setEventEditDraft((current) => ({ ...current, repeatWeekly: edit.target.checked }))} />
                                              <span>Weekly</span>
                                            </label>
                                            <button type="button" onClick={saveEditEvent}>Save</button>
                                            <button type="button" className="ghost-button small-button" onClick={cancelEditEvent}>Cancel</button>
                                          </div>
                                        ) : (
                                          <div key={event.id} className="manage-semesters-scheduled-row">
                                            <span className="section-note">
                                              {timetableEventKindLabel[event.kind]} · {formatDate(event.date)} · {event.time}{event.endTime ? `–${event.endTime}` : ""}{event.repeatWeekly ? " · weekly" : ""}
                                            </span>
                                            <button type="button" className="ghost-button small-button" onClick={() => startEditEvent(event)}>Edit</button>
                                            {eventRemoveConfirm === event.id ? (
                                              <>
                                                <button type="button" className="mini-danger" onClick={() => removeScheduledEvent(event.id)}>Confirm</button>
                                                <button type="button" className="ghost-button small-button" onClick={() => setEventRemoveConfirm(null)}>Cancel</button>
                                              </>
                                            ) : (
                                              <button type="button" className="ghost-button small-button danger" onClick={() => setEventRemoveConfirm(event.id)}>Remove</button>
                                            )}
                                          </div>
                                        )
                                      ))}
                                  </div>
                                ) : null}
                              </div>
                            ))}
                            <button type="button" className="ghost-button small-button" onClick={() => onAddTask(course.semesterId, course.id)}>+ Add task</button>
                          </div>
                        </div>
                      );
                    })}
                    {!courses.length ? <p className="empty-copy">No subjects yet. Add one above.</p> : null}
                  </div>
                </div>
              </>
            ) : (
              <p className="empty-copy">No active semesters yet. Start one above.</p>
            )}
          </div>
        )}
      </section>
    </div>,
    document.body,
  );
}
