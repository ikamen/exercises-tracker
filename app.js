(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var GROUPS = ['legs', 'arms', 'chest', 'core', 'walk']; // columns in the exercise_days table
  var TABLE_ROWS = ['arms', 'chest', 'core', 'legs', 'walk']; // top-to-bottom row order in the tracker table

  // A row with nothing ticked and no notes.
  function emptyRow(date) {
    var row = { date: date, notes: '' };
    GROUPS.forEach(function (group) { row[group] = false; });
    return row;
  }

  // ---------- date helpers ----------
  function formatDate(d) {
    var day = String(d.getDate()).padStart(2, '0');
    var month = MONTHS[d.getMonth()];
    var year = d.getFullYear();
    return day + '-' + month + '-' + year;
  }

  function parseDate(str) {
    var parts = str.split('-');
    var day = parseInt(parts[0], 10);
    var month = MONTHS.indexOf(parts[1]);
    var year = parseInt(parts[2], 10);
    return new Date(year, month, day);
  }

  function addDays(d, n) {
    var copy = new Date(d.getTime());
    copy.setDate(copy.getDate() + n);
    return copy;
  }

  function todayString() {
    return formatDate(new Date());
  }

  // ---------- app state ----------
  var state = {
    realRows: [],           // rows as loaded from / saved to the database, sorted ascending
    displayRows: [],         // realRows plus a virtual "today" placeholder if not present yet
    selectedDate: null,
    draft: {},               // selected date's exercise values, including unsaved taps
    savesCompleted: 0,       // lets a slow read tell whether a save finished after it started
    originalSnapshot: null,  // snapshot of selected row's values, for dirty-check
    pendingDate: null,       // date the user tried to switch to while dirty
    exercisesLoaded: false,
    exercisesFirstOpen: true,
    currentExerciseGroup: 'Arms',
    manifest: []
  };

  // ---------- DOM refs ----------
  var el = {
    navTracker: document.getElementById('nav-tracker'),
    navExercises: document.getElementById('nav-exercises'),
    tabTracker: document.getElementById('tab-tracker'),
    tabExercises: document.getElementById('tab-exercises'),
    trackerTable: document.getElementById('tracker-table'),
    saveBtn: document.getElementById('save-btn'),
    notesField: document.getElementById('notes-field'),
    exerciseGroups: document.getElementById('exercise-groups'),
    exerciseScroller: document.getElementById('exercise-scroller'),
    exerciseEmpty: document.getElementById('exercise-empty'),
    errorBanner: document.getElementById('error-banner'),
    loadingOverlay: document.getElementById('loading-overlay'),
    syncIndicator: document.getElementById('sync-indicator'),
    confirmOverlay: document.getElementById('confirm-overlay'),
    confirmSave: document.getElementById('confirm-save'),
    confirmDiscard: document.getElementById('confirm-discard'),
    loginScreen: document.getElementById('login-screen'),
    loginForm: document.getElementById('login-form'),
    loginUsername: document.getElementById('login-username'),
    loginPassword: document.getElementById('login-password'),
    loginError: document.getElementById('login-error'),
    loginBtn: document.getElementById('login-btn')
  };

  // ---------- error banner ----------
  var errorTimer = null;
  function showError() {
    el.errorBanner.hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () { el.errorBanner.hidden = true; }, 4000);
  }

  // ---------- loading spinner ----------
  // Counts requests in flight so overlapping reads/saves keep it visible
  // until the last one finishes.
  var pendingRequests = 0;
  function withSpinner(promise) {
    pendingRequests++;
    el.loadingOverlay.hidden = false;
    return promise.finally(function () {
      pendingRequests--;
      if (pendingRequests === 0) el.loadingOverlay.hidden = true;
    });
  }

  // ---------- API (Supabase) ----------
  // The login session is kept under AUTH_KEY in localStorage, so a returning
  // visit can tell straight away whether to show the login screen.
  var AUTH_KEY = 'exerciseTracker.auth';
  var TABLE = 'exercise_days';
  var COLUMNS = 'date, ' + GROUPS.join(', ') + ', notes';
  var PAGE_SIZE = 1000; // the most rows Supabase returns per request
  var NOT_LOGGED_IN = 'not logged in';

  var db = window.supabase.createClient(CONFIG.SUPABASE_URL, CONFIG.SUPABASE_PUBLISHABLE_KEY, {
    auth: { storageKey: AUTH_KEY }
  });

  // The database stores dates as "2026-09-17"; the app uses "17-Sep-2026".
  function fromDbRow(dbRow) {
    var parts = dbRow.date.split('-');
    var row = emptyRow(formatDate(new Date(+parts[0], +parts[1] - 1, +parts[2])));
    GROUPS.forEach(function (group) { row[group] = !!dbRow[group]; });
    row.notes = dbRow.notes || '';
    return row;
  }

  function toDbRow(row, userId) {
    var d = parseDate(row.date);
    var dbRow = {
      user_id: userId,
      date: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'),
      notes: row.notes || ''
    };
    GROUPS.forEach(function (group) { dbRow[group] = !!row[group]; });
    return dbRow;
  }

  // Rejects with NOT_LOGGED_IN when there's no session (the login screen is
  // shown), or with the auth error if the session couldn't be refreshed
  // (e.g. offline), which shows the usual connection error instead.
  function currentUserId() {
    return db.auth.getSession().then(function (res) {
      if (res.error) throw res.error;
      if (!res.data.session) throw new Error(NOT_LOGGED_IN);
      return res.data.session.user.id;
    });
  }

  function apiRead() {
    return currentUserId().then(function () { return readPage(0, []); });
  }

  function readPage(from, rows) {
    return db.from(TABLE)
      .select(COLUMNS)
      .order('date')
      .range(from, from + PAGE_SIZE - 1)
      .then(function (res) {
        if (res.error) throw res.error;
        rows = rows.concat(res.data.map(fromDbRow));
        return res.data.length < PAGE_SIZE ? rows : readPage(from + PAGE_SIZE, rows);
      });
  }

  function apiSave(rows) {
    return withSpinner(currentUserId()
      .then(function (userId) {
        return db.from(TABLE).upsert(
          rows.map(function (row) { return toDbRow(row, userId); }),
          { onConflict: 'user_id,date' }
        );
      })
      .then(function (res) {
        if (res.error) throw res.error;
        return true;
      }));
  }

  function handleApiError(err) {
    if (err && err.message === NOT_LOGGED_IN) {
      showLogin();
    } else {
      showError();
    }
  }

  function hasSavedSession() {
    try {
      return !!localStorage.getItem(AUTH_KEY);
    } catch (e) {
      return false;
    }
  }

  // ---------- local copy of the data ----------
  // The last rows read from or saved to the database are kept in localStorage
  // so the table can be shown immediately on the next visit, while the
  // fresh copy loads from Supabase.
  var CACHE_KEY = 'exerciseTracker.rows';

  function readCache() {
    try {
      var json = localStorage.getItem(CACHE_KEY);
      return json ? JSON.parse(json) : null;
    } catch (e) {
      return null; // storage blocked or corrupt: fall back to a normal load
    }
  }

  function writeCache(rows) {
    try {
      localStorage.setItem(CACHE_KEY, JSON.stringify(rows));
    } catch (e) { /* storage unavailable; the app still works without it */ }
  }

  function clearCache() {
    try {
      localStorage.removeItem(CACHE_KEY);
    } catch (e) { /* storage unavailable; nothing to clear */ }
  }

  // ---------- tracker tab: rendering ----------
  function buildDisplayRows() {
    var rows = state.realRows.slice();
    var today = todayString();
    var hasToday = rows.some(function (r) { return r.date === today; });
    if (!hasToday) {
      var placeholder = emptyRow(today);
      placeholder._virtual = true;
      rows.push(placeholder);
    }
    state.displayRows = rows;
  }

  // One column per date; within it, one cell per group in TABLE_ROWS order.
  // Saved groups show their icon. In the selected column the cells reflect
  // the unsaved selection (state.draft) and pressed cells get a background.
  function renderTable() {
    var scrollLeft = el.trackerTable.scrollLeft; // emptying the table resets it
    el.trackerTable.innerHTML = '';
    state.displayRows.forEach(function (row) {
      var col = document.createElement('div');
      col.className = 'date-col';
      col.dataset.date = row.date;

      var parts = row.date.split('-'); // "17-Sep-2026" -> "17" / "Sep"
      var head = document.createElement('div');
      head.className = 'date-head';
      head.innerHTML = '<span class="day"></span><span class="month"></span>';
      head.querySelector('.day').textContent = parts[0];
      head.querySelector('.month').textContent = parts[1];
      col.appendChild(head);

      TABLE_ROWS.forEach(function (group) {
        var cell = document.createElement('div');
        cell.className = 'date-cell';
        cell.dataset.group = group;
        // Styled as a button only in the selected column; the label shows
        // while the button is unpressed, the icon once it's pressed.
        var btn = document.createElement('div');
        btn.className = 'cell-btn';
        var label = document.createElement('span');
        label.className = 'cell-label';
        label.textContent = group.toUpperCase();
        btn.appendChild(label);
        cell.appendChild(btn);
        col.appendChild(cell);
      });

      renderColumn(col, row);
      el.trackerTable.appendChild(col);
    });
    el.trackerTable.scrollLeft = scrollLeft;
  }

  function renderColumn(col, row) {
    var isSelected = row.date === state.selectedDate;
    var values = isSelected ? state.draft : row;
    col.classList.toggle('is-selected', isSelected);
    col.querySelectorAll('.date-cell').forEach(function (cell) {
      renderCell(cell, !!values[cell.dataset.group]);
    });
  }

  // Re-renders only the given dates' columns, so switching dates doesn't
  // rebuild the whole table and re-create every icon.
  function renderColumns(dates) {
    dates.forEach(function (date) {
      var row = findRow(date);
      var col = el.trackerTable.querySelector('.date-col[data-date="' + date + '"]');
      if (row && col) renderColumn(col, row);
    });
  }

  function renderCell(cell, isOn) {
    var group = cell.dataset.group;
    var btn = cell.querySelector('.cell-btn');
    var img = btn.querySelector('img');
    cell.classList.toggle('is-pressed', isOn);
    if (isOn && !img) {
      img = document.createElement('img');
      img.src = 'icons/muscle-groups/' + group + '.svg';
      img.alt = group;
      btn.appendChild(img);
    } else if (!isOn && img) {
      btn.removeChild(img);
    }
  }

  function findRow(date) {
    return state.displayRows.find(function (r) { return r.date === date; });
  }

  function readDetailPanel() {
    var values = { notes: el.notesField.value };
    GROUPS.forEach(function (group) { values[group] = state.draft[group]; });
    return values;
  }

  function isDirty() {
    if (!state.originalSnapshot) return false;
    var current = readDetailPanel();
    var snap = state.originalSnapshot;
    if (current.notes !== snap.notes) return true;
    return GROUPS.some(function (g) { return current[g] !== snap[g]; });
  }

  function selectDate(date) {
    var row = findRow(date) || emptyRow(date);
    var previousDate = state.selectedDate;
    state.selectedDate = date;
    state.draft = {};
    GROUPS.forEach(function (group) { state.draft[group] = !!row[group]; });
    el.notesField.value = row.notes || '';
    state.originalSnapshot = readDetailPanel();
    if (el.trackerTable.querySelector('.date-col[data-date="' + date + '"]')) {
      renderColumns([previousDate, date]);
    } else {
      renderTable();
    }
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    var active = el.trackerTable.querySelector('.date-col.is-selected');
    if (active) active.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }

  function onDateClick(date) {
    if (date === state.selectedDate) return;
    if (isDirty()) {
      state.pendingDate = date;
      el.confirmOverlay.hidden = false;
      return;
    }
    selectDate(date);
  }

  // ---------- saving ----------
  function buildSavePayload(targetDate, values) {
    var rowsToSave = [];
    var lastReal = state.realRows[state.realRows.length - 1];

    if (!lastReal || parseDate(targetDate) > parseDate(lastReal.date)) {
      var start = lastReal ? addDays(parseDate(lastReal.date), 1) : null;
      var end = addDays(parseDate(targetDate), -1);
      if (start) {
        for (var d = start; d.getTime() <= end.getTime(); d = addDays(d, 1)) {
          rowsToSave.push(emptyRow(formatDate(d)));
        }
      }
    }

    var row = emptyRow(targetDate);
    GROUPS.forEach(function (group) { row[group] = values[group]; });
    row.notes = values.notes;
    rowsToSave.push(row);

    return rowsToSave;
  }

  function mergeIntoRealRows(savedRows) {
    savedRows.forEach(function (row) {
      var idx = state.realRows.findIndex(function (r) { return r.date === row.date; });
      if (idx >= 0) {
        state.realRows[idx] = row;
      } else {
        state.realRows.push(row);
      }
    });
    state.realRows.sort(function (a, b) { return parseDate(a.date) - parseDate(b.date); });
  }

  // Resolves to true on success, false on failure (never rejects) so callers
  // can safely decide whether it's OK to proceed (e.g. switch dates).
  function saveCurrent() {
    var values = readDetailPanel();
    var rowsToSave = buildSavePayload(state.selectedDate, values);
    el.saveBtn.disabled = true;
    return apiSave(rowsToSave)
      .then(function () {
        mergeIntoRealRows(rowsToSave);
        writeCache(state.realRows);
        state.savesCompleted++;
        buildDisplayRows();
        state.originalSnapshot = values;
        renderTable();
        return true;
      })
      .catch(function (err) {
        handleApiError(err);
        return false;
      })
      .finally(function () {
        el.saveBtn.disabled = false;
      });
  }

  el.saveBtn.addEventListener('click', function () { saveCurrent(); });

  el.confirmSave.addEventListener('click', function () {
    var target = state.pendingDate;
    el.confirmOverlay.hidden = true;
    saveCurrent().then(function (success) {
      // If the save failed, keep the user on the original date with their
      // unsaved edits intact rather than switching away and losing them.
      if (!success) return;
      state.pendingDate = null;
      selectDate(target);
    });
  });

  el.confirmDiscard.addEventListener('click', function () {
    var target = state.pendingDate;
    el.confirmOverlay.hidden = true;
    state.pendingDate = null;
    selectDate(target);
  });

  // ---------- tracker table taps ----------
  // Tapping another date's column selects it; tapping a cell in the
  // selected column toggles that exercise.
  el.trackerTable.addEventListener('click', function (evt) {
    var col = evt.target.closest('.date-col');
    if (!col) return;
    if (col.dataset.date !== state.selectedDate) {
      onDateClick(col.dataset.date);
      return;
    }
    var cell = evt.target.closest('.date-cell');
    if (!cell) return;
    var group = cell.dataset.group;
    state.draft[group] = !state.draft[group];
    renderCell(cell, state.draft[group]);
  });

  // ---------- initial load of tracker data ----------
  // Shows the local copy straight away (if there is one), then replaces it
  // with the database's data once that arrives. Only the first-ever load, with
  // nothing to show yet, blocks the screen with the full spinner.
  function loadTracker() {
    if (!hasSavedSession()) {
      showLogin();
      return Promise.resolve();
    }
    var cached = readCache();
    var savesAtStart = state.savesCompleted;
    var request = apiRead();

    if (cached) {
      showRows(cached);
      el.syncIndicator.hidden = false;
    } else {
      request = withSpinner(request);
    }

    return request
      .then(function (rows) {
        // A save that finished meanwhile already updated the table and the
        // local copy; this read may have started before it, so drop it.
        if (state.savesCompleted !== savesAtStart) return;
        writeCache(rows);
        if (cached) {
          refreshRows(rows);
        } else {
          showRows(rows);
        }
      })
      .catch(function (err) {
        handleApiError(err);
      })
      .finally(function () {
        el.syncIndicator.hidden = true;
      });
  }

  function setRealRows(rows) {
    rows.sort(function (a, b) { return parseDate(a.date) - parseDate(b.date); });
    state.realRows = rows;
    buildDisplayRows();
  }

  function showRows(rows) {
    setRealRows(rows);
    selectDate(todayString());
    el.trackerTable.scrollLeft = el.trackerTable.scrollWidth;
  }

  // Swaps in fresh rows without moving the user: the selected date and
  // scroll position stay, and unsaved taps or notes are kept.
  function refreshRows(rows) {
    var dirty = isDirty();
    setRealRows(rows);
    if (!dirty) {
      selectDate(findRow(state.selectedDate) ? state.selectedDate : todayString());
    }
    renderTable();
  }

  // ---------- tab switching ----------
  function showTab(name) {
    var isTracker = name === 'tracker';
    el.tabTracker.classList.toggle('is-active', isTracker);
    el.tabExercises.classList.toggle('is-active', !isTracker);
    el.navTracker.classList.toggle('is-active', isTracker);
    el.navExercises.classList.toggle('is-active', !isTracker);

    if (!isTracker) {
      if (!state.exercisesLoaded) {
        loadExercises();
      }
    }
  }

  el.navTracker.addEventListener('click', function () { showTab('tracker'); });
  el.navExercises.addEventListener('click', function () { showTab('exercises'); });

  // ---------- exercises tab ----------
  function loadExercises() {
    fetch('exercises/manifest.json')
      .then(function (r) { return r.json(); })
      .then(function (files) {
        state.manifest = files;
        state.exercisesLoaded = true;
        if (state.exercisesFirstOpen) {
          state.currentExerciseGroup = 'Arms';
          state.exercisesFirstOpen = false;
        }
        setActiveExerciseGroupButton(state.currentExerciseGroup);
        renderExerciseGroup(state.currentExerciseGroup);
      })
      .catch(function () {
        showError();
      });
  }

  function parseFilename(filename) {
    // "Arms - Biceps.jpg" -> { group: "Arms", label: "Biceps" }
    var withoutExt = filename.replace(/\.[^.]+$/, '');
    var sepIndex = withoutExt.indexOf(' - ');
    if (sepIndex === -1) return { group: null, label: withoutExt };
    return {
      group: withoutExt.slice(0, sepIndex).trim(),
      label: withoutExt.slice(sepIndex + 3).trim()
    };
  }

  function renderExerciseGroup(group) {
    var items = state.manifest
      .map(function (filename) {
        var parsed = parseFilename(filename);
        return { filename: filename, group: parsed.group, label: parsed.label };
      })
      .filter(function (item) {
        return item.group && item.group.toLowerCase() === group.toLowerCase();
      });

    el.exerciseScroller.innerHTML = '';

    if (!items.length) {
      el.exerciseEmpty.hidden = false;
      el.exerciseScroller.appendChild(el.exerciseEmpty);
      return;
    }
    el.exerciseEmpty.hidden = true;

    items.forEach(function (item) {
      var nameEl = document.createElement('div');
      nameEl.className = 'exercise-name';
      nameEl.textContent = item.label;

      var imgEl = document.createElement('img');
      imgEl.className = 'exercise-image';
      imgEl.src = 'exercises/images/' + item.filename;
      imgEl.alt = item.label;

      el.exerciseScroller.appendChild(nameEl);
      el.exerciseScroller.appendChild(imgEl);
    });
  }

  function setActiveExerciseGroupButton(group) {
    el.exerciseGroups.querySelectorAll('.group-btn').forEach(function (btn) {
      btn.classList.toggle('is-active', btn.dataset.group === group);
    });
  }

  el.exerciseGroups.addEventListener('click', function (evt) {
    var btn = evt.target.closest('.group-btn');
    if (!btn) return;
    state.currentExerciseGroup = btn.dataset.group;
    setActiveExerciseGroupButton(state.currentExerciseGroup);
    renderExerciseGroup(state.currentExerciseGroup);
  });

  // ---------- login ----------
  // Username + password for the one account created in the Supabase
  // dashboard; there's no sign-up. The session is remembered on the device.
  function showLogin() {
    el.loginPassword.value = '';
    el.loginError.hidden = true;
    el.loginScreen.hidden = false;
  }

  function showLoginError(message) {
    el.loginError.textContent = message;
    el.loginError.hidden = false;
  }

  el.loginForm.addEventListener('submit', function (evt) {
    evt.preventDefault();
    var username = el.loginUsername.value.trim().toLowerCase();
    var password = el.loginPassword.value;
    if (!username || !password) {
      showLoginError('Enter your username and password.');
      return;
    }

    el.loginBtn.disabled = true;
    el.loginBtn.textContent = 'Logging in…';
    el.loginError.hidden = true;
    db.auth.signInWithPassword({ email: username + '@' + CONFIG.USERNAME_EMAIL_DOMAIN, password: password })
      .then(function (res) {
        var error = res.error;
        if (!error) {
          el.loginScreen.hidden = true;
          el.loginPassword.value = '';
          loadTracker();
        } else if (error.status === 400 || error.code === 'invalid_credentials') {
          showLoginError("That username and password don't match.");
        } else if (error.name === 'AuthRetryableFetchError') {
          showLoginError("Can't reach the server. Check your connection and try again.");
        } else {
          showLoginError(error.message);
        }
      })
      .finally(function () {
        el.loginBtn.disabled = false;
        el.loginBtn.textContent = 'Log in';
      });
  });

  el.loginUsername.addEventListener('input', function () { el.loginError.hidden = true; });
  el.loginPassword.addEventListener('input', function () { el.loginError.hidden = true; });

  // If the saved session stops being valid (e.g. the user is deleted in the
  // dashboard), forget the local copy of the data and ask for the login again.
  db.auth.onAuthStateChange(function (event) {
    if (event === 'SIGNED_OUT') {
      clearCache();
      showLogin();
    }
  });

  // ---------- boot ----------
  loadTracker();

})();
