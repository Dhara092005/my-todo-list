// Frontend To-do app script (client)

// ---------------- PROTECT PAGE ----------------
if (!localStorage.getItem('userId')) {
  window.location.href = 'auth.html';
}

// API URL
const API_URL = 'http://localhost:3000';

// DOM Elements
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const dueDateInput = document.getElementById('due-date');
const dueTimeInput = document.getElementById('due-time');
const prioritySelect = document.getElementById('priority-select');
const repeatSelect = document.getElementById('repeat-select');
const reminderLeadSelect = document.getElementById('reminder-lead');
const defaultReminderLeadSelect = document.getElementById('default-reminder-lead');
const editModal = document.getElementById('edit-modal');
const editTextInput = document.getElementById('edit-text');
const editDueDateInput = document.getElementById('edit-due-date');
const editDueTimeInput = document.getElementById('edit-due-time');
const editReminderLeadSelect = document.getElementById('edit-reminder-lead');
const editRepeatSelect = document.getElementById('edit-repeat');
const editPrioritySelect = document.getElementById('edit-priority');
const saveEditBtn = document.getElementById('save-edit');
const cancelEditBtn = document.getElementById('cancel-edit');
const addWaterHabitBtn = document.getElementById('add-water-habit');
const todoList = document.getElementById('todo-list');
const clearCompletedBtn = document.getElementById('clear-completed');
const filterButtons = document.querySelectorAll('.filter-btn');
const themeToggleBtn = document.getElementById('theme-toggle');
const notificationsBtn = document.getElementById('notifications-btn');
const notificationsBadge = document.getElementById('notifications-badge');
const notificationPanel = document.getElementById('notification-panel');
const notificationList = document.getElementById('notification-list');
const closeNotificationPanelBtn = document.getElementById('close-notification-panel');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const settingsBtn = document.getElementById('settings-btn');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const autoClearCheckbox = document.getElementById('toggle-auto-clear');
const reminderCheckbox = document.getElementById('toggle-reminder');

let pendingNotifications = [];
let editingTodoId = null;

let todos = [];
let currentFilter = 'all';

// Settings
let settings = {
  autoClearCompleted: true,
  reminderBeforeDue: true,
  defaultReminderLeadMinutes: 10,
};

// ---------------- SOCKET.IO REAL-TIME ----------------
let socket;
function initSocket() {
  try {
    const token = localStorage.getItem('token');
    if (!token) {
      console.warn('No auth token present for socket connection');
      return;
    }

    socket = io({ auth: { token } });
    socket.on('connect', () => {
      console.log('Realtime socket connected');
    });

    socket.on('notification', (payload) => {
      if (!settings.reminderBeforeDue) return;
      if (payload) {
        addPendingNotification(payload);
        showNotificationForTodo(payload);
      }
    });

    socket.on('connect_error', (err) => {
      console.error('Realtime connect error:', err && err.message);
    });
  } catch (e) {
    console.error('Socket init failed', e && e.message);
  }
}

// ---------------- LOAD TODOS ----------------
async function loadTodos() {
  const userId = localStorage.getItem('userId');

  const res = await fetch(`${API_URL}/todos/${userId}`);
  const data = await res.json();

  if (data.success) {
    todos = data.todos;
  } else {
    todos = [];
  }

  renderTodos();
}

function addPendingNotification(notification) {
  const todoId = notification.todoId || notification._id;
  if (!todoId) return;
  const exists = pendingNotifications.some(n => n.todoId === todoId || n._id === todoId);
  if (!exists) {
    pendingNotifications.unshift({
      todoId,
      text: notification.text,
      dueDate: notification.dueDate,
      dueTime: notification.dueTime,
      reminderCount: notification.reminderCount || 1
    });
  }
  renderNotificationBadge();
  renderNotificationPanel();
}

function playReminderSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.type = 'sine';
    oscillator.frequency.value = 520;
    oscillator.connect(gain);
    gain.connect(ctx.destination);
    gain.gain.setValueAtTime(0.1, ctx.currentTime);
    oscillator.start();
    oscillator.stop(ctx.currentTime + 0.14);
  } catch (err) {
    console.error('Sound playback failed', err && err.message);
  }
}

function showDesktopNotification(title, body) {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, silent: true });
  }
}

async function ensureNotificationPermission() {
  if (!('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn('Notification permission request failed', err && err.message);
    }
  }
}

async function fetchPendingNotifications() {
  const userId = localStorage.getItem('userId');
  if (!userId) return;

  try {
    const res = await fetch(`${API_URL}/todos/notifications/${userId}`);
    const data = await res.json();
    if (data.success && Array.isArray(data.todos)) {
      pendingNotifications = data.todos.map(todo => ({
        todoId: todo._id,
        text: todo.text,
        dueDate: todo.dueDate,
        dueTime: todo.dueTime,
        reminderCount: todo.reminderCount || 1
      }));
      renderNotificationBadge();
      renderNotificationPanel();
    }
  } catch (err) {
    console.error('Error fetching pending notifications', err && err.message);
  }
}

function renderNotificationBadge() {
  const count = pendingNotifications.length;
  notificationsBadge.textContent = count;
  notificationsBadge.classList.toggle('hidden', count === 0);
}

function renderNotificationPanel() {
  if (!notificationList) return;
  notificationList.innerHTML = '';

  if (pendingNotifications.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'notification-card';
    empty.textContent = 'No pending reminders.';
    notificationList.appendChild(empty);
    return;
  }

  pendingNotifications.forEach(notification => {
    const card = document.createElement('div');
    card.className = 'notification-card';

    const title = document.createElement('strong');
    title.textContent = notification.text || 'Task Reminder';

    const when = document.createElement('small');
    when.textContent = `${notification.dueDate || ''} ${notification.dueTime || ''}`.trim();

    const actions = document.createElement('div');
    actions.style.display = 'flex';
    actions.style.justifyContent = 'space-between';
    actions.style.gap = '0.5rem';

    const countTag = document.createElement('span');
    countTag.textContent = notification.reminderCount > 1 ? `Reminder #${notification.reminderCount}` : 'Due now';
    countTag.style.color = '#aaa';
    countTag.style.fontSize = '0.8rem';

    const ackButton = document.createElement('button');
    ackButton.textContent = 'Mark read';
    ackButton.addEventListener('click', async () => {
      await acknowledgeNotification(notification.todoId);
      pendingNotifications = pendingNotifications.filter(n => n.todoId !== notification.todoId);
      renderNotificationBadge();
      renderNotificationPanel();
    });

    const snoozeButton = document.createElement('button');
    snoozeButton.textContent = 'Snooze 5m';
    snoozeButton.addEventListener('click', async () => {
      await snoozeNotification(notification.todoId, 5);
      pendingNotifications = pendingNotifications.filter(n => n.todoId !== notification.todoId);
      renderNotificationBadge();
      renderNotificationPanel();
    });

    actions.appendChild(countTag);
    actions.appendChild(snoozeButton);
    actions.appendChild(ackButton);
    card.appendChild(title);
    card.appendChild(when);
    card.appendChild(actions);
    notificationList.appendChild(card);
  });
}

function toggleNotificationPanel() {
  if (!notificationPanel) return;
  notificationPanel.classList.toggle('open');
  notificationPanel.classList.toggle('hidden', !notificationPanel.classList.contains('open'));
}

function openEditModal(todo) {
  if (!editModal) return;
  editingTodoId = todo._id;
  editTextInput.value = todo.text || '';
  editDueDateInput.value = todo.dueDate || '';
  editDueTimeInput.value = todo.dueTime || '';
  editReminderLeadSelect.value = String(todo.reminderLeadMinutes || settings.defaultReminderLeadMinutes);
  editRepeatSelect.value = todo.repeat || 'none';
  editPrioritySelect.value = todo.priority || 'medium';
  editModal.classList.remove('hidden');
}

function closeEditModal() {
  if (!editModal) return;
  editingTodoId = null;
  editModal.classList.add('hidden');
}

async function saveTodoEdit() {
  if (!editingTodoId) return;

  if (editTextInput.value.trim().length === 0) {
    alert('Task text cannot be empty.');
    return;
  }

  if (editDueDateInput.value && isDueDateTimeInPast(editDueDateInput.value, editDueTimeInput.value)) {
    alert('Please choose a due date and time that is not in the past.');
    return;
  }

  try {
    const res = await fetch(`${API_URL}/todos/update/${editingTodoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: editTextInput.value.trim(),
        dueDate: editDueDateInput.value,
        dueTime: editDueTimeInput.value,
        reminderLeadMinutes: Number(editReminderLeadSelect.value) || settings.defaultReminderLeadMinutes,
        repeat: editRepeatSelect.value,
        priority: editPrioritySelect.value
      })
    });

    const data = await res.json();
    if (!data.success) {
      alert(data.message || 'Unable to update task.');
    }
  } catch (err) {
    console.error('Error updating task', err && err.message);
  }

  closeEditModal();
  loadTodos();
}

// ---------------- ADD TODO ----------------
function parseDueDateTime(dueDate, dueTime) {
  if (!dueDate) return null;
  const timePart = dueTime && dueTime.trim() ? dueTime : '00:00';
  const iso = `${dueDate}T${timePart}:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
}

function shouldNotifyOnAdd(todo) {
  const dueAt = parseDueDateTime(todo.dueDate, todo.dueTime);
  if (!dueAt) return false;
  const now = new Date();
  const leadMinutes = Number(todo.reminderLeadMinutes) || 10;
  const leadMs = leadMinutes * 60 * 1000;
  return dueAt.getTime() - now.getTime() <= leadMs;
}

function isDueDateTimeInPast(dueDate, dueTime) {
  if (!dueDate) return false;
  const timePart = dueTime && dueTime.trim() ? dueTime : '23:59';
  const dueAt = new Date(`${dueDate}T${timePart}:00`);
  return dueAt.getTime() < Date.now();
}

async function addTodo(text, dueDate, dueTime, priority, repeat = 'none', reminderLeadMinutes = 10) {
  const userId = localStorage.getItem('userId');

  const res = await fetch(`${API_URL}/todos/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      userId,
      text,
      dueDate,
      dueTime,
      reminderLeadMinutes,
      priority,
      repeat
    })
  });

  const data = await res.json();

  if (data.success && data.todo && shouldNotifyOnAdd(data.todo) && settings.reminderBeforeDue) {
    showNotificationForTodo({
      todoId: data.todo._id,
      text: data.todo.text,
      dueDate: data.todo.dueDate,
      dueTime: data.todo.dueTime,
      reminderCount: 1
    });
  }

  loadTodos();
}

// ---------------- DELETE TODO ----------------
async function removeTodo(id) {
  await fetch(`${API_URL}/todos/${id}`, {
    method: 'DELETE'
  });
}

// ---------------- TOGGLE TODO ----------------
async function toggleCompleted(id) {
  await fetch(`${API_URL}/todos/toggle/${id}`, {
    method: 'PUT'
  });

  loadTodos();
}

// ---------------- RENDER TODOS ----------------
function renderTodos() {

  todoList.innerHTML = '';

  const filteredTodos = todos.filter(todo => {
    if (currentFilter === 'all') return true;
    if (currentFilter === 'active') return !todo.completed;
    if (currentFilter === 'completed') return todo.completed;
  });

  filteredTodos.forEach(todo => {

    const li = document.createElement('li');
    li.classList.add('added');
    li.dataset.id = todo._id;

    const todoText = document.createElement('span');
    todoText.classList.add('todo-text');

    if (todo.completed) {
      todoText.classList.add('done');
    }

    todoText.textContent = todo.text;
    todoText.style.flex = '1';

    todoText.addEventListener('click', () => {
      toggleCompleted(todo._id);
    });

    const metaContainer = document.createElement('div');
    metaContainer.classList.add('todo-meta');
    if (todo.reminderLeadMinutes) {
      const reminderSpan = document.createElement('span');
      reminderSpan.textContent = `⏰ ${todo.reminderLeadMinutes} min before`;
      reminderSpan.classList.add('badge-reminder');
      metaContainer.appendChild(reminderSpan);
    }

    if (todo.dueDate) {
      const dateSpan = document.createElement('span');
      dateSpan.textContent = todo.dueDate;
      metaContainer.appendChild(dateSpan);
    }

    if (todo.dueTime) {
      const timeSpan = document.createElement('span');
      timeSpan.textContent = todo.dueTime;
      metaContainer.appendChild(timeSpan);
    }

    if (todo.priority) {
      const prioritySpan = document.createElement('span');
      prioritySpan.textContent =
        todo.priority.charAt(0).toUpperCase() +
        todo.priority.slice(1);

      metaContainer.appendChild(prioritySpan);
    }

    if (todo.repeat && todo.repeat !== 'none') {
      const repeatSpan = document.createElement('span');
      repeatSpan.textContent = '🔁 ' + todo.repeat;
      repeatSpan.classList.add('badge-repeat');
      metaContainer.appendChild(repeatSpan);
    }

    const buttonsContainer = document.createElement('div');

    const editBtn = document.createElement('button');
    editBtn.className = 'edit-btn';
    editBtn.textContent = '✏️';
    editBtn.title = 'Edit task';
    editBtn.addEventListener('click', (event) => {
      event.stopPropagation();
      openEditModal(todo);
    });

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'delete-btn';
    deleteBtn.innerHTML = '🗑️';

    deleteBtn.addEventListener('click', async () => {
      await removeTodo(todo._id);
      loadTodos();
    });

    buttonsContainer.appendChild(editBtn);
    buttonsContainer.appendChild(deleteBtn);

    li.appendChild(todoText);
    li.appendChild(metaContainer);
    li.appendChild(buttonsContainer);

    todoList.appendChild(li);
  });

  updateProgressBar();
}

// ---------------- PROGRESS ----------------
function updateProgressBar() {

  const total = todos.length;
  const completed = todos.filter(t => t.completed).length;

  const percent = total === 0 ? 0 : Math.round((completed / total) * 100);

  progressBar.value = percent;
  progressText.textContent = `${percent}% Completed`;
}

// ---------------- FILTER ----------------
function setFilter(filter) {
  currentFilter = filter;
  renderTodos();
}

// ---------------- THEME ----------------
function toggleTheme() {
  document.body.classList.toggle('light');

  localStorage.setItem(
    'theme',
    document.body.classList.contains('light') ? 'light' : 'dark'
  );
}

// ---------------- SETTINGS ----------------
function openSettings() {
  settingsModal.style.display = 'block';
}

function closeSettings() {
  settingsModal.style.display = 'none';
}

// ---------------- LOGOUT ----------------
function logout() {

  localStorage.removeItem('userId');
  localStorage.removeItem('username');

  window.location.href = 'auth.html';
}

// IMPORTANT: make logout available for HTML onclick
window.logout = logout;

// ---------------- IN-APP NOTIFICATION UI ----------------
function showNotificationForTodo(todo) {
  if (!settings.reminderBeforeDue) return;
  addPendingNotification(todo);

  const container = document.createElement('div');
  container.className = 'in-app-notification';
  container.style.position = 'fixed';
  container.style.right = '1rem';
  container.style.bottom = '1rem';
  container.style.background = '#222';
  container.style.color = '#fff';
  container.style.padding = '12px 16px';
  container.style.borderRadius = '8px';
  container.style.boxShadow = '0 6px 18px rgba(0,0,0,0.2)';
  container.style.zIndex = 9999;
  container.style.maxWidth = '320px';

  const title = document.createElement('div');
  title.style.fontWeight = '600';
  title.style.marginBottom = '6px';
  title.textContent = 'Reminder: ' + (todo.text || 'Task due');

  const meta = document.createElement('div');
  meta.style.fontSize = '12px';
  meta.style.opacity = '0.9';
  meta.textContent = `${todo.dueDate || ''} ${todo.dueTime || ''}`.trim();

  const actions = document.createElement('div');
  actions.style.marginTop = '8px';
  actions.style.textAlign = 'right';

  const dismiss = document.createElement('button');
  dismiss.textContent = 'Dismiss';
  dismiss.style.marginLeft = '8px';

  dismiss.addEventListener('click', async () => {
    await acknowledgeNotification(todo.todoId || todo._id);
    if (document.body.contains(container)) document.body.removeChild(container);
  });

  actions.appendChild(dismiss);

  container.appendChild(title);
  container.appendChild(meta);
  container.appendChild(actions);

  document.body.appendChild(container);
  playReminderSound();
  showDesktopNotification('Task reminder', `${todo.text} due ${todo.dueDate || ''} ${todo.dueTime || ''}`.trim());

  // auto-dismiss after 20s
  setTimeout(async () => {
    if (document.body.contains(container)) {
      await acknowledgeNotification(todo.todoId || todo._id);
      document.body.removeChild(container);
    }
  }, 20 * 1000);
}

async function acknowledgeNotification(todoId) {
  try {
    await fetch(`${API_URL}/todos/notifications/ack/${todoId}`, { method: 'PUT' });
  } catch (err) {
    console.error('Error acknowledging notification', err && err.message);
  }
}

async function snoozeNotification(todoId, minutes = 5) {
  try {
    await fetch(`${API_URL}/todos/notifications/snooze/${todoId}?minutes=${minutes}`, { method: 'PUT' });
  } catch (err) {
    console.error('Error snoozing notification', err && err.message);
  }
}

// ---------------- INIT ----------------
function init() {
  const savedSettings = localStorage.getItem('todoSettings');
  if (savedSettings) {
    try {
      const parsed = JSON.parse(savedSettings);
      settings = { ...settings, ...parsed };
    } catch (err) {
      console.warn('Failed to parse saved settings', err && err.message);
    }
  }

  if (defaultReminderLeadSelect) {
    defaultReminderLeadSelect.value = String(settings.defaultReminderLeadMinutes);
  }
  if (reminderLeadSelect) {
    reminderLeadSelect.value = String(settings.defaultReminderLeadMinutes);
  }
  if (reminderCheckbox) {
    reminderCheckbox.checked = settings.reminderBeforeDue;
  }

  loadTodos();
  fetchPendingNotifications();
  ensureNotificationPermission();
  initSocket();

  const theme = localStorage.getItem('theme');
  if (theme === 'light') {
    document.body.classList.add('light');
  }

  todoForm.addEventListener('submit', e => {
    e.preventDefault();

    const text = todoInput.value.trim();
    if (!text) return;

    if (dueDateInput.value && isDueDateTimeInPast(dueDateInput.value, dueTimeInput.value)) {
      alert('Please choose a due date and time that is not in the past.');
      return;
    }

    addTodo(
      text,
      dueDateInput.value,
      dueTimeInput.value,
      prioritySelect.value,
      repeatSelect.value,
      Number(reminderLeadSelect.value) || settings.defaultReminderLeadMinutes
    );

    todoInput.value = '';
    dueDateInput.value = '';
    dueTimeInput.value = '';
    reminderLeadSelect.value = '10';
    prioritySelect.value = 'medium';
    repeatSelect.value = 'none';
  });

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      setFilter(btn.dataset.filter);
    });
  });

  clearCompletedBtn.addEventListener('click', async () => {
    const completedTodos = todos.filter(t => t.completed);

    await Promise.all(
      completedTodos.map(todo => removeTodo(todo._id))
    );

    loadTodos();
  });

  themeToggleBtn.addEventListener('click', toggleTheme);

  notificationsBtn?.addEventListener('click', () => {
    toggleNotificationPanel();
  });

  closeNotificationPanelBtn?.addEventListener('click', () => {
    toggleNotificationPanel();
  });

  settingsBtn.addEventListener('click', openSettings);

  closeSettingsBtn.addEventListener('click', () => {
    settings.autoClearCompleted = autoClearCheckbox.checked;
    settings.reminderBeforeDue = reminderCheckbox.checked;
    settings.defaultReminderLeadMinutes = Number(defaultReminderLeadSelect.value) || 10;
    localStorage.setItem('todoSettings', JSON.stringify(settings));
    closeSettings();
  });

  saveEditBtn?.addEventListener('click', saveTodoEdit);
  cancelEditBtn?.addEventListener('click', closeEditModal);
  editModal?.addEventListener('click', event => {
    if (event.target === editModal) closeEditModal();
  });

  addWaterHabitBtn?.addEventListener('click', async () => {
    const today = new Date();
    const yyyy = today.getFullYear();
    const mm = String(today.getMonth() + 1).padStart(2, '0');
    const dd = String(today.getDate()).padStart(2, '0');
    await addTodo('Drink water', `${yyyy}-${mm}-${dd}`, '09:00', 'low', 'daily');
  });
}

init();