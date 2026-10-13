/* StudyMate | Browser-only task and study-planner interactions. */
'use strict';

const TASK_STORAGE_KEY = 'studymate.tasks.v1';
const SESSION_STORAGE_KEY = 'studymate.sessions.v1';
const WEEK_DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const ALLOWED_PRIORITIES = ['low', 'medium', 'high'];
const ALLOWED_DURATIONS = [30, 45, 60, 90, 120];

// Keep a fallback copy for browsers that block local storage.
const memoryStorage = {};
let storageAvailable = true;

function readSavedList(key) {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw === null) return [];
    const value = JSON.parse(raw);
    return Array.isArray(value) ? value : [];
  } catch (error) {
    storageAvailable = false;
    return Array.isArray(memoryStorage[key]) ? memoryStorage[key] : [];
  }
}

function saveList(key, items) {
  memoryStorage[key] = items;
  try {
    window.localStorage.setItem(key, JSON.stringify(items));
    storageAvailable = true;
  } catch (error) {
    storageAvailable = false;
  }
}

function newId() {
  return String(Date.now()) + '-' + Math.random().toString(36).slice(2, 10);
}

function setFeedback(element, message, isError = false) {
  element.textContent = message;
  element.classList.toggle('is-error', isError);
}

function makeElement(tagName, className, textValue) {
  const node = document.createElement(tagName);
  if (className) node.className = className;
  if (textValue !== undefined) node.textContent = textValue;
  return node;
}

function prettyDate(value) {
  // Construct local calendar dates to avoid timezone day shifts.
  const parts = value.split('-').map(Number);
  if (parts.length !== 3 || parts.some(number => !Number.isFinite(number))) return value;
  const date = new Date(parts[0], parts[1] - 1, parts[2]);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' });
}

function initTasks() {
  const form = document.getElementById('task-form');
  if (!form) return;

  const feedback = document.getElementById('task-form-message');
  const list = document.getElementById('task-list');
  const empty = document.getElementById('task-empty');
  const filters = document.querySelectorAll('input[name="task-filter"]');
  let tasks = readSavedList(TASK_STORAGE_KEY).filter(task =>
    task && typeof task.id === 'string' && typeof task.title === 'string' &&
    typeof task.dueDate === 'string' && typeof task.completed === 'boolean'
  );
  let currentFilter = 'all';

  function render() {
    const completed = tasks.filter(task => task.completed).length;
    document.getElementById('stat-total').textContent = String(tasks.length);
    document.getElementById('stat-pending').textContent = String(tasks.length - completed);
    document.getElementById('stat-completed').textContent = String(completed);
    document.getElementById('task-count-label').textContent = tasks.length === 1 ? '1 task' : `${tasks.length} tasks`;

    const visible = tasks.filter(task =>
      currentFilter === 'all' || (currentFilter === 'active' && !task.completed) ||
      (currentFilter === 'completed' && task.completed)
    );
    visible.sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    list.replaceChildren();
    empty.hidden = visible.length > 0;

    visible.forEach(task => {
      const item = makeElement('li', 'task-item' + (task.completed ? ' is-done' : ''));
      const checkbox = makeElement('input', 'task-check');
      checkbox.type = 'checkbox';
      checkbox.checked = task.completed;
      checkbox.setAttribute('aria-label', 'Mark ' + task.title + ' as ' + (task.completed ? 'not completed' : 'completed'));
      checkbox.addEventListener('change', () => {
        task.completed = checkbox.checked;
        saveList(TASK_STORAGE_KEY, tasks);
        render();
      });

      const content = makeElement('div', 'task-content');
      content.append(makeElement('div', 'task-title', task.title));
      const details = makeElement('div', 'task-meta');
      if (task.subject) details.append(makeElement('span', '', task.subject));
      details.append(makeElement('span', '', 'Due ' + prettyDate(task.dueDate)));
      content.append(details);

      const priority = ALLOWED_PRIORITIES.includes(task.priority) ? task.priority : 'medium';
      const priorityLabel = makeElement('span', 'priority-label priority-' + priority, priority[0].toUpperCase() + priority.slice(1));
      const remove = makeElement('button', 'delete-button', 'Delete');
      remove.type = 'button';
      remove.setAttribute('aria-label', 'Delete ' + task.title);
      remove.addEventListener('click', () => {
        tasks = tasks.filter(candidate => candidate.id !== task.id);
        saveList(TASK_STORAGE_KEY, tasks);
        render();
        setFeedback(feedback, storageAvailable ? 'Task removed.' : 'Task removed for this session only; storage is blocked.');
      });
      item.append(checkbox, content, priorityLabel, remove);
      list.append(item);
    });
  }

  filters.forEach(filter => filter.addEventListener('change', () => {
    if (filter.checked) {
      currentFilter = filter.value;
      render();
    }
  }));

  form.addEventListener('submit', event => {
    event.preventDefault();
    const title = form.elements.taskName.value.trim();
    const subject = form.elements.subject.value.trim();
    const dueDate = form.elements.dueDate.value;
    const priority = form.elements.priority.value;
    if (!title || title.length > 80 || subject.length > 50) {
      setFeedback(feedback, 'Enter a task name (up to 80 characters).', true);
      form.elements.taskName.focus();
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(new Date(dueDate + 'T12:00:00').getTime())) {
      setFeedback(feedback, 'Choose a valid due date.', true);
      form.elements.dueDate.focus();
      return;
    }
    tasks.push({ id: newId(), title, subject, dueDate, priority: ALLOWED_PRIORITIES.includes(priority) ? priority : 'medium', completed: false });
    saveList(TASK_STORAGE_KEY, tasks);
    form.reset();
    document.getElementById('task-priority').value = 'medium';
    currentFilter = 'all';
    document.querySelector('input[name="task-filter"][value="all"]').checked = true;
    render();
    setFeedback(feedback, storageAvailable ? 'Task added successfully.' : 'Task added for this session only; storage is blocked.');
    form.elements.taskName.focus();
  });
  render();
}

function initPlanner() {
  const form = document.getElementById('planner-form');
  if (!form) return;

  const feedback = document.getElementById('planner-form-message');
  const grid = document.getElementById('week-grid');
  let sessions = readSavedList(SESSION_STORAGE_KEY).filter(session =>
    session && typeof session.id === 'string' && typeof session.topic === 'string' &&
    WEEK_DAYS.includes(session.day) && /^\d{2}:\d{2}$/.test(session.time) &&
    ALLOWED_DURATIONS.includes(Number(session.duration))
  );

  function render() {
    document.getElementById('session-total').textContent = sessions.length === 1 ? '1 session' : `${sessions.length} sessions`;
    const minutes = sessions.reduce((sum, session) => sum + Number(session.duration), 0);
    document.getElementById('minutes-total').textContent = `${minutes} minutes`;
    grid.replaceChildren();

    WEEK_DAYS.forEach(day => {
      const card = makeElement('article', 'day-card');
      card.append(makeElement('h3', 'day-title', day));
      const body = makeElement('div', 'day-body');
      const onDay = sessions.filter(session => session.day === day).sort((a, b) => a.time.localeCompare(b.time));
      if (!onDay.length) body.append(makeElement('p', 'day-empty', 'No plans yet'));
      onDay.forEach(session => {
        const entry = makeElement('div', 'session');
        entry.append(makeElement('div', 'session-time', session.time));
        entry.append(makeElement('div', 'session-title', session.topic));
        entry.append(makeElement('div', 'session-duration', `${session.duration} min`));
        const remove = makeElement('button', 'session-delete', 'Remove');
        remove.type = 'button';
        remove.setAttribute('aria-label', 'Remove ' + session.topic + ' from ' + day);
        remove.addEventListener('click', () => {
          sessions = sessions.filter(item => item.id !== session.id);
          saveList(SESSION_STORAGE_KEY, sessions);
          render();
          setFeedback(feedback, storageAvailable ? 'Session removed.' : 'Session removed for this session only; storage is blocked.');
        });
        entry.append(remove);
        body.append(entry);
      });
      card.append(body);
      grid.append(card);
    });
  }

  form.addEventListener('submit', event => {
    event.preventDefault();
    const topic = form.elements.topic.value.trim();
    const day = form.elements.day.value;
    const time = form.elements.time.value;
    const duration = Number(form.elements.duration.value);
    if (!topic || topic.length > 80) {
      setFeedback(feedback, 'Enter a study activity (up to 80 characters).', true);
      form.elements.topic.focus();
      return;
    }
    if (!WEEK_DAYS.includes(day) || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time) || !ALLOWED_DURATIONS.includes(duration)) {
      setFeedback(feedback, 'Choose a valid day, time and duration.', true);
      return;
    }
    sessions.push({ id: newId(), topic, day, time, duration });
    saveList(SESSION_STORAGE_KEY, sessions);
    form.elements.topic.value = '';
    render();
    setFeedback(feedback, storageAvailable ? 'Study session added.' : 'Session added for this session only; storage is blocked.');
    form.elements.topic.focus();
  });
  render();
}

document.addEventListener('DOMContentLoaded', () => {
  initTasks();
  initPlanner();
});