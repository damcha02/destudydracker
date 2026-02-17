// src/features/projects.js
import { DOM } from "../core/dom.js";
import { getStore } from "../store/store.js";
import { openModal } from "../ui/modal.js";
import { Events } from "../core/events.js";

const expandedProjects = {};
const expandedSubjects = {};

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}

function percent(done, total) {
  return !total || total <= 0 ? 0 : Math.round((done / total) * 100);
}

function sumSubject(subject) {
  let total = 0, done = 0;
  const tasks = subject.tasks || {};
  Object.keys(tasks).forEach((k) => {
    const t = tasks[k];
    total += t.total || 0;
    done += t.done || 0;
  });
  done = clamp(done, 0, total);
  return { total, done, pct: percent(done, total) };
}

function sumProject(project) {
  let total = 0, done = 0;
  (project.subjects || []).forEach((sub) => {
    const s = sumSubject(sub);
    total += s.total;
    done += s.done;
  });
  done = clamp(done, 0, total);
  return { total, done, pct: percent(done, total) };
}

function escapeHtml(str) {
  return String(str)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

async function getProjects() {
  return (await getStore().getProjects?.()) ?? [];
}

async function setProjects(projects) {
  await getStore().setProjects(projects);
}

/* ----------------- CRUD ----------------- */

async function addProject() {
  const name = await openModal({
    title: "Project name",
    placeholder: "e.g. Semester 2",
    validate: v => (!v ? "Please enter a project name." : null),
  });
  if (!name) return;

  const projects = await getProjects();
  projects.push({ name, subjects: [] });
  await setProjects(projects);
}

async function editProject(pIndex) {
  const projects = await getProjects();
  const project = projects[pIndex];
  if (!project) return;

  const newName = await openModal({
    title: `Rename project "${project.name}"`,
    placeholder: project.name,
    validate: v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  project.name = newName;
  await setProjects(projects);
}

async function deleteProject(pIndex) {
  const projects = await getProjects();
  const project = projects[pIndex];
  if (!project) return;

  const confirm = await openModal({
    title: `Delete project "${project.name}"?`,
    placeholder: "Type DELETE to confirm",
    validate: v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  projects.splice(pIndex, 1);
  delete expandedProjects[pIndex];
  Object.keys(expandedSubjects).forEach(k => {
    if (k.startsWith(`${pIndex}-`)) delete expandedSubjects[k];
  });

  await setProjects(projects);
}

async function addSubject(pIndex) {
  const name = await openModal({
    title: "Subject name",
    placeholder: "e.g. Linear Algebra",
    validate: v => (!v ? "Please enter a subject name." : null),
  });
  if (!name) return;

  const projects = await getProjects();
  const proj = projects[pIndex];
  if (!proj) return;
  proj.subjects = proj.subjects || [];
  proj.subjects.push({ name, tasks: {} });
  await setProjects(projects);
}

async function editSubject(pIndex, sIndex) {
  const projects = await getProjects();
  const subj = projects?.[pIndex]?.subjects?.[sIndex];
  if (!subj) return;

  const newName = await openModal({
    title: `Rename subject "${subj.name}"`,
    placeholder: subj.name,
    validate: v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  subj.name = newName;
  await setProjects(projects);
}

async function deleteSubject(pIndex, sIndex) {
  const projects = await getProjects();
  const subj = projects?.[pIndex]?.subjects?.[sIndex];
  if (!subj) return;

  const confirm = await openModal({
    title: `Delete subject "${subj.name}"?`,
    placeholder: "Type DELETE to confirm",
    validate: v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  projects[pIndex].subjects.splice(sIndex, 1);
  delete expandedSubjects[`${pIndex}-${sIndex}`];
  await setProjects(projects);
}

async function addTask(pIndex, sIndex) {
  const taskName = await openModal({
    title: "Task name",
    placeholder: "e.g. Lectures",
    validate: v => (!v ? "Please enter a task name." : null),
  });
  if (!taskName) return;

  const totalStr = await openModal({
    title: `Total units for "${taskName}"`,
    placeholder: "e.g. 27",
    validate: v => {
      const n = Number(v);
      return (!Number.isFinite(n) || n <= 0) ? "Please enter a positive number." : null;
    },
  });
  if (!totalStr) return;

  const total = Math.floor(Number(totalStr));
  const projects = await getProjects();
  const subj = projects?.[pIndex]?.subjects?.[sIndex];
  if (!subj) return;

  if (!subj.tasks) subj.tasks = {};
  subj.tasks[taskName] = { total, done: 0 };
  await setProjects(projects);
}

async function editTask(pIndex, sIndex, taskKey) {
  const projects = await getProjects();
  const subj = projects?.[pIndex]?.subjects?.[sIndex];
  const task = subj?.tasks?.[taskKey];
  if (!task) return;

  const newName = await openModal({
    title: `Rename task "${taskKey}"`,
    placeholder: taskKey,
    validate: v => (!v ? "Please enter a name." : null),
  });
  if (!newName) return;

  const totalStr = await openModal({
    title: `Total units for "${newName}"`,
    placeholder: String(task.total),
    validate: v => {
      const n = Number(v);
      return (!Number.isFinite(n) || n <= 0) ? "Please enter a positive number." : null;
    },
  });
  if (!totalStr) return;

  const newTotal = Math.floor(Number(totalStr));
  const done = Math.min(task.done || 0, newTotal);

  delete subj.tasks[taskKey];
  subj.tasks[newName] = { total: newTotal, done };
  await setProjects(projects);
}

async function deleteTask(pIndex, sIndex, taskKey) {
  const projects = await getProjects();
  const subj = projects?.[pIndex]?.subjects?.[sIndex];
  const task = subj?.tasks?.[taskKey];
  if (!task) return;

  const confirm = await openModal({
    title: `Delete task "${taskKey}"?`,
    placeholder: "Type DELETE to confirm",
    validate: v => (v === "DELETE" ? null : "Type DELETE to confirm."),
  });
  if (!confirm) return;

  delete subj.tasks[taskKey];
  await setProjects(projects);
}

async function changeTaskDone(pIndex, sIndex, taskKey, delta) {
  const projects = await getProjects();
  const task = projects?.[pIndex]?.subjects?.[sIndex]?.tasks?.[taskKey];
  if (!task) return;

  task.done = clamp((task.done || 0) + delta, 0, task.total || 0);
  await setProjects(projects);
}

/* ----------------- Render ----------------- */

async function renderProjects() {
  if (!DOM.projectsList) return;

  const projects = await getProjects();
  DOM.projectsList.innerHTML = "";

  if (!projects.length) {
    const p = document.createElement("p");
    p.style.color = "rgba(220,215,186,0.75)";
    p.textContent = "No projects yet. Use the 'Add Project' button to create one.";
    DOM.projectsList.appendChild(p);
    return;
  }

  projects.forEach((project, pIndex) => {
    const totals = sumProject(project);

    const card = document.createElement("div");
    card.className = "project";

    const header = document.createElement("div");
    header.className = "project-header";

    const title = document.createElement("div");
    title.className = "project-title";
    title.textContent = project.name;

    const circle = document.createElement("div");
    circle.className = "progress-circle";
    circle.textContent = `${totals.pct}%`;

    const actions = document.createElement("div");
    actions.className = "project-actions";

    const editBtn = document.createElement("button");
    editBtn.className = "edit-btn";
    editBtn.title = "Edit project";
    editBtn.textContent = "✎";
    editBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      editProject(pIndex);
    });

    const delBtn = document.createElement("button");
    delBtn.className = "delete-btn";
    delBtn.title = "Delete project";
    delBtn.textContent = "🗑";
    delBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      deleteProject(pIndex);
    });

    actions.append(editBtn, delBtn);
    header.append(title, circle, actions);

    const body = document.createElement("div");
    body.className = "project-body";
    body.classList.toggle("hidden", !expandedProjects[pIndex]);

    const addSubBtn = document.createElement("button");
    addSubBtn.type = "button";
    addSubBtn.textContent = "Add Subject";
    addSubBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addSubject(pIndex);
    });
    body.appendChild(addSubBtn);

    (project.subjects || []).forEach((subject, sIndex) => {
      const subjTotals = sumSubject(subject);

      const subj = document.createElement("div");
      subj.className = "subject";

      const subjKey = `${pIndex}-${sIndex}`;
      subj.classList.toggle("expanded", !!expandedSubjects[subjKey]);

      const subjHeader = document.createElement("div");
      subjHeader.className = "subject-header";

      const left = document.createElement("div");
      left.className = "subject-left";
      left.innerHTML =
        `<div class="subject-name">${escapeHtml(subject.name)}</div>` +
        `<div class="subject-progress">${subjTotals.done}/${subjTotals.total} • ${subjTotals.pct}%</div>`;

      const subjActions = document.createElement("div");
      subjActions.className = "subject-actions";

      const addTaskBtn = document.createElement("button");
      addTaskBtn.title = "Add task";
      addTaskBtn.textContent = "+";
      addTaskBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        addTask(pIndex, sIndex);
      });

      const editSubBtn = document.createElement("button");
      editSubBtn.className = "edit-btn";
      editSubBtn.title = "Edit subject";
      editSubBtn.textContent = "✎";
      editSubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        editSubject(pIndex, sIndex);
      });

      const delSubBtn = document.createElement("button");
      delSubBtn.className = "delete-btn";
      delSubBtn.title = "Delete subject";
      delSubBtn.textContent = "🗑";
      delSubBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        deleteSubject(pIndex, sIndex);
      });

      subjActions.append(addTaskBtn, editSubBtn, delSubBtn);
      subjHeader.append(left, subjActions);

      subjHeader.addEventListener("click", () => {
        expandedSubjects[subjKey] = !expandedSubjects[subjKey];
        renderProjects().catch(console.error);
      });

      const subjBody = document.createElement("div");
      subjBody.className = "subject-body";

      if (expandedSubjects[subjKey]) {
        const tasks = subject.tasks || {};
        const keys = Object.keys(tasks);

        if (keys.length === 0) {
          const empty = document.createElement("div");
          empty.className = "task-meta";
          empty.textContent = "No tasks yet.";
          subjBody.appendChild(empty);
        } else {
          keys.forEach((taskKey) => {
            const t = tasks[taskKey];
            const pct = percent(t.done || 0, t.total || 0);

            const row = document.createElement("div");
            row.className = "task-row";

            const nameCell = document.createElement("div");
            nameCell.innerHTML =
              `<div class="task-name">${escapeHtml(taskKey)}</div>` +
              `<div class="task-meta">${t.done || 0}/${t.total || 0} • ${pct}%</div>`;

            const rail = document.createElement("div");
            rail.className = "progress-rail";

            const fill = document.createElement("div");
            fill.className = "progress-fill";
            fill.style.width = `${pct}%`;
            rail.appendChild(fill);

            const taskActions = document.createElement("div");
            taskActions.className = "task-actions";

            const minusBtn = document.createElement("button");
            minusBtn.title = "Mark one unit undone";
            minusBtn.textContent = "−";
            minusBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              changeTaskDone(pIndex, sIndex, taskKey, -1);
            });

            const plusBtn = document.createElement("button");
            plusBtn.title = "Mark one unit done";
            plusBtn.textContent = "+";
            plusBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              changeTaskDone(pIndex, sIndex, taskKey, 1);
            });

            const editTaskBtn = document.createElement("button");
            editTaskBtn.className = "edit-btn";
            editTaskBtn.title = "Edit task";
            editTaskBtn.textContent = "✎";
            editTaskBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              editTask(pIndex, sIndex, taskKey);
            });

            const deleteTaskBtn = document.createElement("button");
            deleteTaskBtn.className = "delete-btn";
            deleteTaskBtn.title = "Delete task";
            deleteTaskBtn.textContent = "🗑";
            deleteTaskBtn.addEventListener("click", (e) => {
              e.stopPropagation();
              deleteTask(pIndex, sIndex, taskKey);
            });

            taskActions.append(minusBtn, plusBtn, editTaskBtn, deleteTaskBtn);

            row.append(nameCell, rail, taskActions);
            subjBody.appendChild(row);
          });
        }
      }

      subj.append(subjHeader, subjBody);
      body.appendChild(subj);
    });

    header.addEventListener("click", () => {
      expandedProjects[pIndex] = !expandedProjects[pIndex];
      renderProjects().catch(console.error);
    });

    card.append(header, body);
    DOM.projectsList.appendChild(card);
  });
}

/* ----------------- Init ----------------- */

export function initProjects() {
  console.log("Projects initialized");

  // Re-fetch DOM elements at init time (avoids stale/null refs)
  DOM.projectsList = document.getElementById("projects-list");
  DOM.addProjectButton = document.getElementById("add-project-button");

  console.log("AddProjectButton found:", DOM.addProjectButton);

  if (!DOM.addProjectButton) {
    console.error("Missing #add-project-button in DOM (id mismatch or loaded too early).");
    return;
  }

  DOM.addProjectButton.addEventListener("click", (e) => {
    e.preventDefault();
    console.log("Add Project clicked");
    addProject().catch(console.error);
  });

  // Render when entering Projects workspace (index 1)
  Events.on("workspace:change", (e) => { //window.addEventListener
    if (e.detail?.index === 1) renderProjects().catch(console.error);
  });

  // Re-render when data changes
  Events.on("projects:changed", () => renderProjects().catch(console.error));

  renderProjects().catch(console.error);
}

