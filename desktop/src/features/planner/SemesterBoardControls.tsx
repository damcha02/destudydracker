import { useMemo, useState } from "react";
import type { Dispatch, FormEvent, SetStateAction } from "react";
import { formatDate } from "../../lib/metrics";
import { makeId } from "../../lib/storage";
import type { AppState, Course, Semester } from "../../types";

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  setMessage: (message: string) => void;
  onSemesterCreated?: (semesterId: string) => void;
};

export function SemesterSetupWizardButton({ setState, setMessage, onSemesterCreated }: Props) {
  const [wizardOpen, setWizardOpen] = useState(false);

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
        completedSheetCount: 0,
      }));

    setState((current) => ({
      ...current,
      semesters: [...current.semesters, newSemester],
      courses: [...current.courses, ...newCourses],
    }));
    setWizardOpen(false);
    onSemesterCreated?.(newSemester.id);
    setMessage(`${newSemester.name} set up with ${newCourses.length} course${newCourses.length === 1 ? "" : "s"}.`);
  }

  return (
    <>
      <button type="button" className="ghost-button" onClick={() => setWizardOpen(true)}>
        New semester (setup wizard)
      </button>
      {wizardOpen ? (
        <div className="timetable-modal-backdrop" onMouseDown={() => setWizardOpen(false)}>
          <section className="timetable-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="timetable-modal-head">
              <strong>New semester setup</strong>
              <button type="button" className="ghost-button" onClick={() => setWizardOpen(false)}>Close</button>
            </header>
            <form onSubmit={submitWizard} className="timetable-modal-form">
              <label className="field">
                <span>Semester name</span>
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
              <p className="section-note">Add courses for this semester (optional link to the course page or LMS).</p>
              {[0, 1, 2, 3].map((index) => (
                <div key={index} className="timetable-modal-course-row">
                  <input name="courseName" placeholder={`Course ${index + 1} name`} />
                  <input name="courseUrl" placeholder="https://... (optional)" />
                </div>
              ))}
              <button type="submit">Create semester</button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  );
}

export function SemesterArchiveButton({ state, setState, setMessage }: Omit<Props, "onSemesterCreated">) {
  const [archiveModalOpen, setArchiveModalOpen] = useState(false);
  const archivedSemesters = useMemo(() => state.semesters.filter((semester) => semester.archived), [state.semesters]);

  function unarchiveSemester(semesterId: string) {
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) => (item.id === semesterId ? { ...item, archived: false, archivedAt: null } : item)),
    }));
    setMessage("Semester restored to active semesters.");
  }

  return (
    <>
      <button type="button" className="ghost-button" onClick={() => setArchiveModalOpen(true)}>
        Archive ({archivedSemesters.length})
      </button>
      {archiveModalOpen ? (
        <div className="timetable-modal-backdrop" onMouseDown={() => setArchiveModalOpen(false)}>
          <section className="timetable-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="timetable-modal-head">
              <strong>Archived semesters</strong>
              <button type="button" className="ghost-button" onClick={() => setArchiveModalOpen(false)}>Close</button>
            </header>
            <div className="stack-list compact">
              {archivedSemesters.length ? archivedSemesters.map((item) => {
                const courses = state.courses.filter((course) => course.semesterId === item.id);
                const tasks = state.tasks.filter((task) => task.semesterId === item.id);
                const exams = state.exams.filter((exam) => exam.semesterId === item.id);
                return (
                  <div key={item.id} className="overview-row detailed-overview">
                    <div>
                      <strong>{item.name}</strong>
                      <p className="section-note">
                        {item.startDate ? formatDate(item.startDate) : "No start date"} – {item.endDate ? formatDate(item.endDate) : "No end date"} · archived {item.archivedAt ? formatDate(item.archivedAt.slice(0, 10)) : ""}
                      </p>
                      <p className="section-note">{courses.length} courses · {tasks.length} tasks · {exams.length} exams</p>
                    </div>
                    <button type="button" className="ghost-button" onClick={() => unarchiveSemester(item.id)}>Restore</button>
                  </div>
                );
              }) : <p className="empty-copy">No archived semesters yet.</p>}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
