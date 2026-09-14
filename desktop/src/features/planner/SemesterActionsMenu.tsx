import { useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { formatDate } from "../../lib/metrics";
import { makeId } from "../../lib/storage";
import type { AppState, Holiday, Semester } from "../../types";

type ExtraActions = {
  onAddCourse?: () => void;
  onEditSemester?: () => void;
  onNewSemester?: () => void;
  onRemoveSemester?: () => void;
};

type Props = {
  state: AppState;
  setState: Dispatch<SetStateAction<AppState>>;
  semester: Semester;
  setMessage: (message: string) => void;
  extraActions?: ExtraActions;
};

export function SemesterActionsMenu({ state, setState, semester, setMessage, extraActions }: Props) {
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState({ top: 0, left: 0 });
  const [holidayModalOpen, setHolidayModalOpen] = useState(false);
  const [archiveConfirm, setArchiveConfirm] = useState(false);
  const [holidayDraft, setHolidayDraft] = useState({ label: "", startDate: "", endDate: "" });

  const semesterHolidays = state.holidays.filter((holiday) => holiday.semesterId === semester.id);

  function close() {
    setOpen(false);
    setArchiveConfirm(false);
  }

  function setSemesterPhase(phase: Semester["phase"]) {
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) => (item.id === semester.id ? { ...item, phase } : item)),
    }));
    setMessage(phase === "exam-prep" ? "Switched to Exam Prep." : "Switched back to Semester phase.");
    close();
  }

  function archiveSemester() {
    setState((current) => ({
      ...current,
      semesters: current.semesters.map((item) =>
        item.id === semester.id ? { ...item, archived: true, archivedAt: new Date().toISOString() } : item,
      ),
    }));
    close();
    setMessage("Semester archived.");
  }

  function addHoliday() {
    if (!holidayDraft.label.trim() || !holidayDraft.startDate || !holidayDraft.endDate) {
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

  const menuWidth = 230;

  function toggleOpen() {
    if (!open && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const left = Math.min(rect.left, window.innerWidth - menuWidth - 12);
      setMenuPosition({ top: rect.bottom + 6, left: Math.max(12, left) });
    }
    setOpen((current) => !current);
  }

  return (
    <div className="semester-menu-wrap">
      <button
        ref={triggerRef}
        type="button"
        className="semester-menu-trigger"
        aria-label={`Manage ${semester.name}`}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={toggleOpen}
      >
        ⋮
      </button>

      {open ? createPortal(
        <>
          <div className="semester-menu-scrim" onClick={close} />
          <div className="semester-menu-dropdown" role="menu" style={{ top: `${menuPosition.top}px`, left: `${menuPosition.left}px` }}>
            <div className="semester-menu-title">Manage {semester.name}</div>
            {extraActions?.onAddCourse ? (
              <button type="button" role="menuitem" onClick={() => { extraActions.onAddCourse!(); close(); }}>Add Course</button>
            ) : null}
            {extraActions?.onEditSemester ? (
              <button type="button" role="menuitem" onClick={() => { extraActions.onEditSemester!(); close(); }}>Edit Semester</button>
            ) : null}
            {extraActions?.onNewSemester ? (
              <button type="button" role="menuitem" onClick={() => { extraActions.onNewSemester!(); close(); }}>New Semester</button>
            ) : null}
            {semester.phase === "semester" ? (
              <button type="button" role="menuitem" onClick={() => setSemesterPhase("exam-prep")}>End Semester (Exam Prep)</button>
            ) : (
              <button type="button" role="menuitem" onClick={() => setSemesterPhase("semester")}>Resume Semester phase</button>
            )}
            <button type="button" role="menuitem" onClick={() => { setHolidayModalOpen(true); setOpen(false); }}>Manage Holidays</button>
            {archiveConfirm ? (
              <div className="semester-menu-confirm">
                <span>Archive and remove from active view?</span>
                <button type="button" className="mini-danger" onClick={archiveSemester}>Yes, archive</button>
                <button type="button" className="ghost-button" onClick={() => setArchiveConfirm(false)}>Cancel</button>
              </div>
            ) : (
              <button type="button" role="menuitem" className="danger" onClick={() => setArchiveConfirm(true)}>Archive Semester</button>
            )}
            {extraActions?.onRemoveSemester ? (
              <button type="button" role="menuitem" className="danger" onClick={() => { extraActions.onRemoveSemester!(); close(); }}>Remove Semester</button>
            ) : null}
          </div>
        </>,
        document.body,
      ) : null}

      {holidayModalOpen ? (
        <div className="timetable-modal-backdrop" onMouseDown={() => setHolidayModalOpen(false)}>
          <section className="timetable-modal" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
            <header className="timetable-modal-head">
              <strong>Holidays &amp; breaks — {semester.name}</strong>
              <button type="button" className="ghost-button" onClick={() => setHolidayModalOpen(false)}>Close</button>
            </header>
            <div className="timetable-modal-form">
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
              </div>
              <button type="button" onClick={addHoliday}>Add holiday</button>
              <div className="stack-list compact">
                {semesterHolidays.length ? semesterHolidays.map((holiday) => (
                  <div key={holiday.id} className="overview-row">
                    <span>{holiday.label} · {formatDate(holiday.startDate)} – {formatDate(holiday.endDate)}</span>
                    <button type="button" className="mini-danger" onClick={() => removeHoliday(holiday.id)}>Remove</button>
                  </div>
                )) : <p className="empty-copy">No holidays yet. Recurring lectures, exercise sessions, and sheet releases are suppressed on any date inside a holiday range.</p>}
              </div>
            </div>
          </section>
        </div>
      ) : null}
    </div>
  );
}
