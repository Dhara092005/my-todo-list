// Frontend To-do app script (client)

// ---------------- PROTECT PAGE ----------------
if (!localStorage.getItem('userId')) {
  window.location.href = 'auth.html';
}

// API URL
const API_URL = window.location.origin;

function authenticatedFetch(url, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = localStorage.getItem('token');
  if (token) headers.set('Authorization', `Bearer ${token}`);
  return fetch(url, { ...options, headers });
}

// DOM Elements
const todoForm = document.getElementById('todo-form');
const todoInput = document.getElementById('todo-input');
const categoryInput = document.getElementById('category-input');
const dueDateInput = document.getElementById('due-date');
const dueTimeInput = document.getElementById('due-time');
const prioritySelect = document.getElementById('priority-select');
const repeatSelect = document.getElementById('repeat-select');
const defaultReminderLeadSelect = document.getElementById('default-reminder-lead');
const editModal = document.getElementById('edit-modal');
const editTextInput = document.getElementById('edit-text');
const editDueDateInput = document.getElementById('edit-due-date');
const editDueTimeInput = document.getElementById('edit-due-time');
const editCategoryInput = document.getElementById('edit-category');
const editRepeatSelect = document.getElementById('edit-repeat');
const editPrioritySelect = document.getElementById('edit-priority');
const saveEditBtn = document.getElementById('save-edit');
const cancelEditBtn = document.getElementById('cancel-edit');
const addWaterHabitBtn = document.getElementById('add-water-habit');
const todoList = document.getElementById('todo-list');
const clearCompletedBtn = document.getElementById('clear-completed');
const filterButtons = document.querySelectorAll('.filter-btn');
const themeToggleBtn = document.getElementById('theme-toggle');

const progressBar = document.getElementById('progress-bar');
const progressText = document.getElementById('progress-text');
const settingsBtn = document.getElementById('sidebar-settings');
const settingsModal = document.getElementById('settings-modal');
const closeSettingsBtn = document.getElementById('close-settings');
const autoClearCheckbox = document.getElementById('toggle-auto-clear');
const reminderCheckbox = document.getElementById('toggle-reminder');
const browserNotificationsCheckbox = document.getElementById('toggle-browser-notifications');
const changePasswordForm = document.getElementById('change-password-form');
const profileEditForm = document.getElementById('profile-edit-form');
const profileEditModal = document.getElementById('profile-edit-modal');
let pendingProfilePhoto = null;
const PASSWORD_REQUIREMENTS_MESSAGE = 'Password must be at least 8 characters and include at least one uppercase letter and one special character.';

function isStrongPassword(password) {
  return password.length >= 8 && /[A-Z]/.test(password) && /[^A-Za-z0-9\s]/.test(password);
}

let editingTodoId = null;

let todos = [];
let currentFilter = 'all';
let currentView = 'dashboard';
let selectedCategory = null;
let calendarMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
const defaultCategories = ['Study', 'Work', 'Shopping', 'Personal'];
let categories = [...defaultCategories];

// Settings
let settings = {
  autoClearCompleted: true,
  reminderBeforeDue: true,
  browserNotifications: false,
  defaultReminderLeadMinutes: 30,
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
  const res = await authenticatedFetch(`${API_URL}/todos`);
  const data = await res.json();

  if (data.success) {
    todos = data.todos;
    todos.forEach(todo => {
      const category = (todo.category || '').trim();
      if (category && !categories.some(item => item.toLowerCase() === category.toLowerCase())) {
        categories.push(category);
      }
    });
    renderCategoryNavigation();
  } else {
    todos = [];
  }

  renderTodos();
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
  if (!settings.browserNotifications || !('Notification' in window)) return;
  if (Notification.permission === 'granted') {
    new Notification(title, { body, silent: true });
  }
}

async function ensureNotificationPermission() {
  if (!settings.browserNotifications || !('Notification' in window)) return;
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission();
    } catch (err) {
      console.warn('Notification permission request failed', err && err.message);
    }
  }
}

function openEditModal(todo) {
  if (!editModal) return;
  editingTodoId = todo._id;
  editTextInput.value = todo.text || '';
  editCategoryInput.value = todo.category || '';
  editDueDateInput.value = todo.dueDate || '';
  editDueTimeInput.value = todo.dueTime || '';
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
    const res = await authenticatedFetch(`${API_URL}/todos/update/${editingTodoId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: editTextInput.value.trim(),
        category: editCategoryInput.value.trim(),
        dueDate: editDueDateInput.value,
        dueTime: editDueTimeInput.value,
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

async function addTodo(text, dueDate, dueTime, priority, repeat = 'none', category = '') {
  const res = await authenticatedFetch(`${API_URL}/todos/add`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      text,
      dueDate,
      dueTime,
      category,
      reminderLeadMinutes: settings.defaultReminderLeadMinutes,
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
  await authenticatedFetch(`${API_URL}/todos/${id}`, {
    method: 'DELETE'
  });
}

// ---------------- TOGGLE TODO ----------------
async function toggleCompleted(id) {
  await authenticatedFetch(`${API_URL}/todos/toggle/${id}`, {
    method: 'PUT'
  });

  loadTodos();
}

// ---------------- RENDER TODOS ----------------
function renderTodos() {

  todoList.innerHTML = '';

  const filteredTodos = todos.filter(todo => {
    if (currentView === 'important' && todo.priority !== 'high') return false;
    if (currentView === 'favorites' && !todo.favorite) return false;
    if (currentView === 'category' && (todo.category || '').toLowerCase() !== selectedCategory.toLowerCase()) return false;
    if (['due-today', 'overdue', 'due-soon'].includes(currentView)) {
      if (!todo.dueDate || todo.completed) return false;
      const dueAt = new Date(`${todo.dueDate}T${todo.dueTime || '23:59'}:00`);
      const now = new Date();
      const localDate = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      if (currentView === 'due-today' && todo.dueDate !== localDate) return false;
      if (currentView === 'overdue' && dueAt >= now) return false;
      if (currentView === 'due-soon') {
        const minutesUntilDue = (dueAt.getTime() - now.getTime()) / 60000;
        if (minutesUntilDue < 0 || minutesUntilDue > 30) return false;
      }
    }
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

    if (todo.category) {
      const categorySpan = document.createElement('span');
      categorySpan.textContent = todo.category;
      categorySpan.classList.add('badge-category');
      metaContainer.appendChild(categorySpan);
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

    const favoriteBtn = document.createElement('button');
    favoriteBtn.className = 'favorite-btn';
    favoriteBtn.type = 'button';
    favoriteBtn.textContent = todo.favorite ? '★' : '☆';
    favoriteBtn.title = todo.favorite ? 'Remove from favorites' : 'Add to favorites';
    favoriteBtn.setAttribute('aria-label', favoriteBtn.title);
    favoriteBtn.addEventListener('click', async () => {
      await authenticatedFetch(`${API_URL}/todos/update/${todo._id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ favorite: !todo.favorite })
      });
      loadTodos();
    });

    buttonsContainer.appendChild(favoriteBtn);
    buttonsContainer.appendChild(editBtn);
    buttonsContainer.appendChild(deleteBtn);

    li.appendChild(todoText);
    li.appendChild(metaContainer);
    li.appendChild(buttonsContainer);

    todoList.appendChild(li);
  });

  if (filteredTodos.length === 0) {
    const emptyState = document.createElement('li');
    emptyState.className = 'empty-tasks';
    emptyState.textContent = currentView === 'favorites'
      ? 'No favorite tasks yet.'
      : currentView === 'due-today'
        ? 'No tasks due today.'
        : currentView === 'overdue'
          ? 'No overdue tasks.'
          : currentView === 'due-soon'
            ? 'No tasks due in the next 30 minutes.'
            : currentView === 'all-tasks'
              ? 'No tasks yet.'
              : 'No tasks match this view.';
    todoList.appendChild(emptyState);
  }

  updateProgressBar();
  updateStatistics();
  updateProfileTaskStats();
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
  filterButtons.forEach(button => button.classList.toggle('active', button.dataset.filter === filter));
  renderTodos();
}

function setSidebarView(view, category = null) {
  currentView = view;
  selectedCategory = category;
  currentFilter = 'all';
  filterButtons.forEach(button => button.classList.toggle('active', button.dataset.filter === 'all'));
  const specialView = ['statistics', 'calendar', 'profile'].includes(view);
  const taskContent = document.getElementById('task-content');
  taskContent.classList.toggle('hidden', specialView);
  taskContent.classList.toggle('focused-task-view', ['all-tasks', 'due-today', 'overdue', 'due-soon', 'favorites'].includes(view));
  document.getElementById('statistics-view').classList.toggle('hidden', view !== 'statistics');
  document.getElementById('calendar-view').classList.toggle('hidden', view !== 'calendar');
  document.getElementById('profile-view').classList.toggle('hidden', view !== 'profile');

  const viewTitles = {
    dashboard: 'Dashboard',
    'all-tasks': 'All Tasks',
    categories: 'Categories',
    category: category,
    important: 'Important',
    favorites: 'Favorites',
    calendar: 'Calendar',
    'due-today': "Today's Tasks",
    overdue: 'Overdue Tasks',
    'due-soon': 'Due Soon',
    statistics: 'Statistics',
    profile: 'Profile'
  };
  document.getElementById('page-title').textContent = viewTitles[view] || 'Tasks';
  document.querySelectorAll('.sidebar-link[data-view]:not(.category-link), .category-link').forEach(button => {
    const active = button.dataset.view === view && (view !== 'category' || button.dataset.category === category);
    button.classList.toggle('active', active);
  });
  if (view === 'calendar') renderCalendar();
  if (view === 'profile') loadProfile();
  closeSidebar();
  renderTodos();
}

function closeSidebar() {
  document.body.classList.remove('sidebar-open');
  document.getElementById('app-sidebar').setAttribute('aria-hidden', 'true');
  document.getElementById('menu-toggle').setAttribute('aria-expanded', 'false');
  document.getElementById('menu-toggle').setAttribute('aria-label', 'Open navigation');
}

function renderCalendar() {
  const grid = document.getElementById('calendar-grid');
  const monthTitle = document.getElementById('calendar-month');
  const agenda = document.getElementById('calendar-agenda');
  const year = calendarMonth.getFullYear();
  const month = calendarMonth.getMonth();
  monthTitle.textContent = calendarMonth.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
  grid.innerHTML = '';
  ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].forEach(day => {
    const heading = document.createElement('span');
    heading.className = 'calendar-weekday';
    heading.textContent = day;
    grid.appendChild(heading);
  });

  const firstDay = new Date(year, month, 1).getDay();
  const dayCount = new Date(year, month + 1, 0).getDate();
  const cellCount = Math.ceil((firstDay + dayCount) / 7) * 7;
  for (let cell = 0; cell < cellCount; cell += 1) {
    const dayNumber = cell - firstDay + 1;
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'calendar-day';
    if (dayNumber < 1 || dayNumber > dayCount) {
      button.disabled = true;
      button.classList.add('outside-month');
    } else {
      const dateKey = `${year}-${String(month + 1).padStart(2, '0')}-${String(dayNumber).padStart(2, '0')}`;
      const dayTodos = todos.filter(todo => todo.dueDate === dateKey);
      button.textContent = dayNumber;
      if (dayTodos.length) {
        const count = document.createElement('small');
        count.textContent = `${dayTodos.length} task${dayTodos.length === 1 ? '' : 's'}`;
        button.appendChild(count);
      }
      button.addEventListener('click', () => {
        agenda.textContent = dayTodos.length ? dayTodos.map(todo => todo.text).join(' · ') : 'No tasks scheduled.';
      });
    }
    grid.appendChild(button);
  }
  agenda.textContent = 'Select a date to see its tasks.';
}

function renderCategoryNavigation() {
  const container = document.getElementById('category-navigation');
  container.innerHTML = '';
  const categoryIcons = { Study: '📚', Work: '💼', Shopping: '🛒', Personal: '🏠' };

  categories.forEach(category => {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'sidebar-link category-link';
    button.dataset.view = 'category';
    button.dataset.category = category;
    const icon = document.createElement('span');
    icon.textContent = categoryIcons[category] || '📁';
    button.append(icon, document.createTextNode(category));
    button.addEventListener('click', () => setSidebarView('category', category));
    container.appendChild(button);
  });
}

function openCategoryModal() {
  document.getElementById('category-status').textContent = '';
  document.getElementById('new-category-name').value = '';
  document.getElementById('category-modal').style.display = 'flex';
  document.getElementById('new-category-name').focus();
}

function closeCategoryModal() {
  document.getElementById('category-modal').style.display = 'none';
}

function addCategory(event) {
  event.preventDefault();
  const normalizedCategory = document.getElementById('new-category-name').value.trim();
  const status = document.getElementById('category-status');
  if (!normalizedCategory) return;
  if (categories.some(item => item.toLowerCase() === normalizedCategory.toLowerCase())) {
    status.textContent = 'That category already exists.';
    return;
  }
  categories.push(normalizedCategory);
  localStorage.setItem('todoCategories', JSON.stringify(categories));
  renderCategoryNavigation();
  closeCategoryModal();
  setSidebarView('category', normalizedCategory);
}

function updateStatistics() {
  const completed = todos.filter(todo => todo.completed).length;
  const completionRate = todos.length ? Math.round((completed / todos.length) * 100) : 0;
  document.getElementById('stat-total').textContent = todos.length;
  document.getElementById('stat-completed').textContent = completed;
  document.getElementById('stat-active').textContent = todos.length - completed;
  document.getElementById('stat-completion-rate').textContent = `${completionRate}%`;
  document.getElementById('statistics-progress-bar').value = completionRate;

  const categoryStats = document.getElementById('statistics-categories');
  categoryStats.innerHTML = '';
  categories.forEach(category => {
    const row = document.createElement('div');
    row.className = 'category-stat-row';
    const label = document.createElement('span');
    label.textContent = category;
    const count = document.createElement('strong');
    count.textContent = todos.filter(todo => (todo.category || '').toLowerCase() === category.toLowerCase()).length;
    row.append(label, count);
    categoryStats.appendChild(row);
  });
}

// ---------------- THEME ----------------
function toggleTheme() {
  setTheme(document.body.classList.contains('light') ? 'dark' : 'light');
}

function setTheme(theme) {
  document.body.classList.toggle('light', theme === 'light');
  localStorage.setItem('theme', theme);
}

// ---------------- SETTINGS ----------------
function openSettings() {
  settingsModal.style.display = 'block';
}

function closeSettings() {
  settingsModal.style.display = 'none';
}

async function changePassword(event) {
  event.preventDefault();
  const currentPassword = document.getElementById('current-password').value;
  const newPassword = document.getElementById('new-password').value;
  const confirmPassword = document.getElementById('confirm-new-password').value;
  const status = document.getElementById('change-password-status');
  const submitButton = document.getElementById('change-password-submit');

  if (!isStrongPassword(newPassword)) {
    status.textContent = PASSWORD_REQUIREMENTS_MESSAGE;
    return;
  }
  if (newPassword !== confirmPassword) {
    status.textContent = 'New passwords do not match.';
    return;
  }

  submitButton.disabled = true;
  status.textContent = 'Updating password...';
  try {
    const response = await fetch(`${API_URL}/auth/change-password`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({ currentPassword, newPassword })
    });
    const data = await response.json();
    status.textContent = data.message || (data.success ? 'Password updated.' : 'Unable to update password.');
    if (data.success) changePasswordForm.reset();
  } catch (error) {
    status.textContent = 'Could not reach the server. Try again.';
  } finally {
    submitButton.disabled = false;
  }
}

async function loadProfile() {
  const username = document.getElementById('profile-username');
  const email = document.getElementById('profile-email');
  const joined = document.getElementById('profile-joined');
  username.textContent = localStorage.getItem('username') || 'Account';
  email.textContent = 'Loading profile...';
  joined.textContent = 'Loading...';
  updateProfileTaskStats();
  renderProfilePhoto(localStorage.getItem(profilePhotoStorageKey()));

  try {
    const response = await fetch(`${API_URL}/auth/profile`, {
      headers: { Authorization: `Bearer ${localStorage.getItem('token') || ''}` }
    });
    const data = await response.json();
    if (!data.success) {
      email.textContent = data.message || 'Unable to load profile.';
      return;
    }
    username.textContent = data.profile.username;
    email.textContent = data.profile.email;
    joined.textContent = data.profile.joinedOn
      ? new Date(data.profile.joinedOn).toLocaleDateString(undefined, { timeZone: 'UTC' })
      : 'Unknown';
  } catch (error) {
    email.textContent = 'Unable to load profile.';
    joined.textContent = 'Unavailable';
  }
}

function updateProfileTaskStats() {
  const completed = todos.filter(todo => todo.completed).length;
  document.getElementById('profile-created').textContent = todos.length;
  document.getElementById('profile-completed').textContent = completed;
  document.getElementById('profile-pending').textContent = todos.length - completed;
}

function profilePhotoStorageKey() {
  return `profilePhoto:${localStorage.getItem('userId') || 'guest'}`;
}

function renderProfilePhoto(photoData) {
  const photo = document.getElementById('profile-photo');
  const fallback = document.getElementById('profile-photo-fallback');
  photo.classList.toggle('hidden', !photoData);
  fallback.classList.toggle('hidden', Boolean(photoData));
  if (photoData) photo.src = photoData;
}

function openProfileEditor() {
  document.getElementById('edit-profile-username').value = document.getElementById('profile-username').textContent;
  document.getElementById('edit-profile-email').value = document.getElementById('profile-email').textContent;
  document.getElementById('profile-edit-status').textContent = '';
  document.getElementById('profile-photo-input').value = '';
  pendingProfilePhoto = null;
  const photo = localStorage.getItem(profilePhotoStorageKey());
  const preview = document.getElementById('profile-edit-preview');
  preview.classList.toggle('hidden', !photo);
  if (photo) preview.src = photo;
  profileEditModal.classList.remove('hidden');
}

function closeProfileEditor() {
  profileEditModal.classList.add('hidden');
}

function resizeProfilePhoto(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('Unable to read this photo.'));
    reader.onload = () => {
      const image = new Image();
      image.onerror = () => reject(new Error('Choose a valid image file.'));
      image.onload = () => {
        const scale = Math.min(1, 512 / Math.max(image.width, image.height));
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(image.width * scale);
        canvas.height = Math.round(image.height * scale);
        canvas.getContext('2d').drawImage(image, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.82));
      };
      image.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

async function selectProfilePhoto(event) {
  const file = event.target.files[0];
  if (!file) return;
  const status = document.getElementById('profile-edit-status');
  if (!file.type.startsWith('image/')) {
    status.textContent = 'Choose an image file.';
    return;
  }
  if (file.size > 5 * 1024 * 1024) {
    status.textContent = 'Choose an image smaller than 5 MB.';
    return;
  }
  try {
    pendingProfilePhoto = await resizeProfilePhoto(file);
    const preview = document.getElementById('profile-edit-preview');
    preview.src = pendingProfilePhoto;
    preview.classList.remove('hidden');
    status.textContent = '';
  } catch (error) {
    status.textContent = error.message;
  }
}

async function saveProfile(event) {
  event.preventDefault();
  const status = document.getElementById('profile-edit-status');
  const submitButton = document.getElementById('save-profile-btn');
  submitButton.disabled = true;
  status.textContent = 'Saving profile...';
  try {
    const response = await fetch(`${API_URL}/auth/profile`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({
        username: document.getElementById('edit-profile-username').value.trim(),
        email: document.getElementById('edit-profile-email').value.trim()
      })
    });
    const data = await response.json();
    status.textContent = data.message || 'Unable to save profile.';
    if (!data.success) return;

    document.getElementById('profile-username').textContent = data.profile.username;
    document.getElementById('profile-email').textContent = data.profile.email;
    localStorage.setItem('username', data.profile.username);
    if (pendingProfilePhoto) localStorage.setItem(profilePhotoStorageKey(), pendingProfilePhoto);
    renderProfilePhoto(localStorage.getItem(profilePhotoStorageKey()));
    closeProfileEditor();
  } catch (error) {
    status.textContent = 'Could not reach the server. Try again.';
  } finally {
    submitButton.disabled = false;
  }
}

async function deleteAccount(event) {
  event.preventDefault();
  const confirmed = window.confirm('Delete your account and all your tasks permanently?');
  if (!confirmed) return;

  const status = document.getElementById('delete-account-status');
  const submitButton = document.getElementById('delete-account-submit');
  submitButton.disabled = true;
  status.textContent = 'Deleting account...';
  try {
    const response = await fetch(`${API_URL}/auth/account`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${localStorage.getItem('token') || ''}`
      },
      body: JSON.stringify({ currentPassword: document.getElementById('delete-account-password').value })
    });
    const data = await response.json();
    status.textContent = data.message || 'Unable to delete account.';
    if (data.success) {
      localStorage.removeItem('userId');
      localStorage.removeItem('username');
      localStorage.removeItem('token');
      window.location.href = 'auth.html';
    }
  } catch (error) {
    status.textContent = 'Could not reach the server. Try again.';
  } finally {
    submitButton.disabled = false;
  }
}

// ---------------- LOGOUT ----------------
function logout() {

  localStorage.removeItem('userId');
  localStorage.removeItem('username');
  localStorage.removeItem('token');

  window.location.href = 'auth.html';
}

// IMPORTANT: make logout available for HTML onclick
window.logout = logout;

// ---------------- IN-APP NOTIFICATION UI ----------------
function showNotificationForTodo(todo) {
  if (!settings.reminderBeforeDue) return;

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
    await authenticatedFetch(`${API_URL}/todos/notifications/ack/${todoId}`, { method: 'PUT' });
  } catch (err) {
    console.error('Error acknowledging notification', err && err.message);
  }
}

// ---------------- INIT ----------------
function init() {
  const savedSettings = localStorage.getItem('todoSettings');
  try {
    const savedCategories = JSON.parse(localStorage.getItem('todoCategories') || '[]');
    if (Array.isArray(savedCategories)) {
      categories = [...new Set([...defaultCategories, ...savedCategories.filter(item => typeof item === 'string' && item.trim())])];
    }
  } catch (err) {
    console.warn('Failed to parse saved categories', err && err.message);
  }
  renderCategoryNavigation();
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
  if (reminderCheckbox) {
    reminderCheckbox.checked = settings.reminderBeforeDue;
  }
  if (browserNotificationsCheckbox) {
    browserNotificationsCheckbox.checked = settings.browserNotifications;
  }

  loadTodos();
  ensureNotificationPermission();
  initSocket();

  const theme = localStorage.getItem('theme');
  setTheme(theme === 'light' ? 'light' : 'dark');

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
      categoryInput.value.trim()
    );

    todoInput.value = '';
    dueDateInput.value = '';
    dueTimeInput.value = '';
    categoryInput.value = '';
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
  document.getElementById('calendar-prev').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() - 1, 1);
    renderCalendar();
  });
  document.getElementById('calendar-next').addEventListener('click', () => {
    calendarMonth = new Date(calendarMonth.getFullYear(), calendarMonth.getMonth() + 1, 1);
    renderCalendar();
  });

  settingsBtn.addEventListener('click', () => {
    closeSidebar();
    openSettings();
  });
  document.querySelectorAll('.sidebar-link[data-view]:not(.category-link)').forEach(button => {
    button.addEventListener('click', () => setSidebarView(button.dataset.view));
  });
  document.getElementById('add-category-btn').addEventListener('click', openCategoryModal);
  document.getElementById('category-form').addEventListener('submit', addCategory);
  document.getElementById('cancel-category').addEventListener('click', closeCategoryModal);
  document.getElementById('category-modal').addEventListener('click', event => {
    if (event.target === event.currentTarget) closeCategoryModal();
  });
  document.getElementById('menu-toggle').addEventListener('click', () => {
    const isOpen = document.body.classList.toggle('sidebar-open');
    document.getElementById('app-sidebar').setAttribute('aria-hidden', String(!isOpen));
    document.getElementById('menu-toggle').setAttribute('aria-expanded', String(isOpen));
    document.getElementById('menu-toggle').setAttribute('aria-label', isOpen ? 'Close navigation' : 'Open navigation');
  });
  document.getElementById('sidebar-scrim').addEventListener('click', closeSidebar);

  closeSettingsBtn.addEventListener('click', () => {
    settings.autoClearCompleted = autoClearCheckbox.checked;
    settings.reminderBeforeDue = reminderCheckbox.checked;
    settings.browserNotifications = browserNotificationsCheckbox.checked;
    settings.defaultReminderLeadMinutes = Number(defaultReminderLeadSelect.value) || 10;
    localStorage.setItem('todoSettings', JSON.stringify(settings));
    ensureNotificationPermission();
    closeSettings();
  });
  changePasswordForm?.addEventListener('submit', changePassword);
  document.getElementById('delete-account-form')?.addEventListener('submit', deleteAccount);
  document.getElementById('edit-profile-btn').addEventListener('click', openProfileEditor);
  profileEditForm?.addEventListener('submit', saveProfile);
  document.getElementById('profile-photo-input').addEventListener('change', selectProfilePhoto);
  document.getElementById('cancel-profile-edit').addEventListener('click', closeProfileEditor);
  profileEditModal?.addEventListener('click', event => {
    if (event.target === profileEditModal) closeProfileEditor();
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