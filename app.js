(function () {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var GROUPS = ['legs', 'arms', 'chest', 'core']; // matches sheet column order B-E

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
    realRows: [],           // rows as loaded from / saved to the sheet, sorted ascending
    displayRows: [],         // realRows plus a virtual "today" placeholder if not present yet
    selectedDate: null,
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
    dateList: document.getElementById('date-list'),
    saveBtn: document.getElementById('save-btn'),
    notesField: document.getElementById('notes-field'),
    trackerGroups: document.getElementById('tracker-groups'),
    exerciseGroups: document.getElementById('exercise-groups'),
    exerciseScroller: document.getElementById('exercise-scroller'),
    exerciseEmpty: document.getElementById('exercise-empty'),
    errorBanner: document.getElementById('error-banner'),
    confirmOverlay: document.getElementById('confirm-overlay'),
    confirmSave: document.getElementById('confirm-save'),
    confirmDiscard: document.getElementById('confirm-discard')
  };

  // ---------- error banner ----------
  var errorTimer = null;
  function showError() {
    el.errorBanner.hidden = false;
    clearTimeout(errorTimer);
    errorTimer = setTimeout(function () { el.errorBanner.hidden = true; }, 4000);
  }

  // ---------- API ----------
  function apiRead() {
    return fetch(CONFIG.APPS_SCRIPT_URL + '?action=read')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.error || 'read failed');
        return data.rows;
      });
  }

  function apiSave(rows) {
    return fetch(CONFIG.APPS_SCRIPT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' }, // avoids CORS preflight to Apps Script
      body: JSON.stringify({ action: 'save', rows: rows })
    })
      .then(function (r) { return r.json(); })
      .then(function (data) {
        if (!data.success) throw new Error(data.error || 'save failed');
        return true;
      });
  }

  // ---------- tracker tab: rendering ----------
  function buildDisplayRows() {
    var rows = state.realRows.slice();
    var today = todayString();
    var hasToday = rows.some(function (r) { return r.date === today; });
    if (!hasToday) {
      rows.push({ date: today, legs: false, arms: false, chest: false, core: false, notes: '', _virtual: true });
    }
    state.displayRows = rows;
  }

  function renderDateList() {
    el.dateList.innerHTML = '';
    state.displayRows.forEach(function (row) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'date-item' + (row.date === state.selectedDate ? ' is-selected' : '') + (row._virtual ? ' is-empty' : '');
      btn.textContent = formatDateLabel(row.date);
      btn.setAttribute('role', 'option');
      btn.addEventListener('click', function () { onDateClick(row.date); });
      el.dateList.appendChild(btn);
    });
  }

  function formatDateLabel(dateStr) {
    // "17-Sep-2026" -> "17 Sep" (year hidden for compactness, matches wireframe)
    var parts = dateStr.split('-');
    return parts[0] + ' ' + parts[1];
  }

  function scrollDateListToBottom() {
    el.dateList.scrollTop = el.dateList.scrollHeight;
  }

  function findRow(date) {
    return state.displayRows.find(function (r) { return r.date === date; });
  }

  function renderDetailPanel(date) {
    var row = findRow(date) || { legs: false, arms: false, chest: false, core: false, notes: '' };
    el.notesField.value = row.notes || '';
    GROUPS.forEach(function (group) {
      var btn = el.trackerGroups.querySelector('[data-group="' + group + '"]');
      btn.classList.toggle('is-active', !!row[group]);
    });
    state.originalSnapshot = readDetailPanel();
  }

  function readDetailPanel() {
    var values = { notes: el.notesField.value };
    GROUPS.forEach(function (group) {
      var btn = el.trackerGroups.querySelector('[data-group="' + group + '"]');
      values[group] = btn.classList.contains('is-active');
    });
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
    state.selectedDate = date;
    renderDateList();
    renderDetailPanel(date);
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    var active = el.dateList.querySelector('.is-selected');
    if (active) active.scrollIntoView({ block: 'nearest' });
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
          rowsToSave.push({ date: formatDate(d), legs: false, arms: false, chest: false, core: false, notes: '' });
        }
      }
    }

    rowsToSave.push({
      date: targetDate,
      legs: values.legs,
      arms: values.arms,
      chest: values.chest,
      core: values.core,
      notes: values.notes
    });

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
        buildDisplayRows();
        state.originalSnapshot = values;
        renderDateList();
        return true;
      })
      .catch(function () {
        showError();
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

  // ---------- tracker group buttons ----------
  el.trackerGroups.addEventListener('click', function (evt) {
    var btn = evt.target.closest('.group-btn');
    if (!btn) return;
    btn.classList.toggle('is-active');
  });

  el.notesField.addEventListener('input', function () { /* dirty check reads live value, nothing else needed */ });

  // ---------- initial load of tracker data ----------
  function loadTracker() {
    return apiRead()
      .then(function (rows) {
        rows.sort(function (a, b) { return parseDate(a.date) - parseDate(b.date); });
        state.realRows = rows;
        buildDisplayRows();
        var today = todayString();
        selectDate(today);
        scrollDateListToBottom();
      })
      .catch(function () {
        showError();
      });
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

  // ---------- boot ----------
  loadTracker();

})();
