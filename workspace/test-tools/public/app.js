const state = {
  tasks: [],
  filter: "all",
};

const form = document.getElementById("add-form");
const input = document.getElementById("new-task-title");
const formError = document.getElementById("form-error");
const list = document.getElementById("task-list");
const emptyState = document.getElementById("empty-state");
const itemsLeft = document.getElementById("items-left");
const filterButtons = Array.from(document.querySelectorAll(".filter"));

async function api(path, options = {}) {
  const response = await fetch(path, {
    headers: { "content-type": "application/json" },
    ...options,
  });
  if (!response.ok) {
    const body = await response.json().catch(() => ({}));
    throw new Error(body.error || `Request failed with status ${response.status}`);
  }
  if (response.status === 204) return null;
  return response.json();
}

async function loadTasks() {
  const data = await api("/api/tasks");
  state.tasks = data.tasks;
  render();
}

async function addTask(event) {
  event.preventDefault();
  const title = input.value.trim();
  if (title.length === 0) {
    showFormError("Please enter a task title.");
    return;
  }
  hideFormError();
  try {
    await api("/api/tasks", { method: "POST", body: JSON.stringify({ title }) });
    input.value = "";
    await loadTasks();
  } catch (err) {
    showFormError(err.message);
  }
}

function showFormError(message) {
  formError.textContent = message;
  formError.hidden = false;
}

function hideFormError() {
  formError.hidden = true;
  formError.textContent = "";
}

async function toggleTask(id, completed) {
  try {
    await api(`/api/tasks/${id}`, { method: "PATCH", body: JSON.stringify({ completed }) });
  } finally {
    await loadTasks();
  }
}

async function deleteTask(id) {
  try {
    await api(`/api/tasks/${id}`, { method: "DELETE" });
  } finally {
    await loadTasks();
  }
}

function visibleTasks() {
  if (state.filter === "active") return state.tasks.filter((t) => !t.completed);
  if (state.filter === "completed") return state.tasks.filter((t) => t.completed);
  return state.tasks;
}

function render() {
  const tasks = visibleTasks();

  list.replaceChildren(
    ...tasks.map((task) => {
      const item = document.createElement("li");
      item.className = task.completed ? "task completed" : "task";
      item.dataset.id = task.id;

      const checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.className = "task-toggle";
      checkbox.checked = task.completed;
      checkbox.setAttribute("aria-label", `Mark "${task.title}" as done`);

      const title = document.createElement("span");
      title.className = "task-title";
      title.textContent = task.title;

      const button = document.createElement("button");
      button.className = "task-delete";
      button.textContent = "Delete";
      button.setAttribute("aria-label", `Delete "${task.title}"`);

      item.append(checkbox, title, button);
      return item;
    }),
  );

  const remaining = state.tasks.filter((t) => !t.completed).length;
  itemsLeft.textContent = `${remaining} item${remaining === 1 ? "" : "s"} left`;

  const isEmpty = tasks.length === 0;
  emptyState.hidden = !isEmpty;
  if (isEmpty) {
    emptyState.textContent =
      state.filter === "completed"
        ? "No completed tasks."
        : state.filter === "active"
          ? "No active tasks."
          : "No tasks yet. Add your first one above!";
  }
}

form.addEventListener("submit", addTask);

list.addEventListener("change", (event) => {
  const item = event.target.closest(".task");
  if (!item || !event.target.classList.contains("task-toggle")) return;
  toggleTask(item.dataset.id, event.target.checked);
});

list.addEventListener("click", (event) => {
  const item = event.target.closest(".task");
  if (!item || !event.target.classList.contains("task-delete")) return;
  deleteTask(item.dataset.id);
});

for (const button of filterButtons) {
  button.addEventListener("click", () => {
    state.filter = button.dataset.filter;
    for (const other of filterButtons) {
      const active = other === button;
      other.classList.toggle("active", active);
      other.setAttribute("aria-pressed", String(active));
    }
    render();
  });
}

loadTasks();
