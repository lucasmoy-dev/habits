/* Render de la grilla semanal, estadísticas, modales y eventos de UI. */
const UI = (() => {
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];
  const ROW_GAP = 10; // debe coincidir con el gap de .habits-grid

  let currentWeekStart = Habits.weekStart(Habits.today());
  let editingHabitId = null;
  let currentView = 'home';

  const $ = (id) => document.getElementById(id);

  // ---- Toast ----
  let toastTimer = null;
  function toast(msg) {
    const el = $('toast');
    el.textContent = msg;
    el.classList.remove('hidden');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => el.classList.add('hidden'), 3200);
  }

  // ---- Vistas ----
  function showView(view) {
    currentView = view;
    $('view-home').classList.toggle('hidden', view !== 'home');
    $('view-stats').classList.toggle('hidden', view !== 'stats');
    $('nav-home').classList.toggle('active', view === 'home');
    $('nav-stats').classList.toggle('active', view === 'stats');
    if (view === 'stats') renderStats();
    else render();
  }

  // ---- Grilla semanal ----
  function render() {
    const grid = $('habits-grid');
    const habits = Habits.all();
    const todayD = Habits.today();
    const isCurrentWeek = currentWeekStart.getTime() === Habits.weekStart(todayD).getTime();

    const wEnd = Habits.addDays(currentWeekStart, 6);
    $('week-label').textContent =
      `${currentWeekStart.getDate()} ${MONTHS[currentWeekStart.getMonth()]} – ${wEnd.getDate()} ${MONTHS[wEnd.getMonth()]} ${wEnd.getFullYear()}`;
    $('btn-today').classList.toggle('hidden', isCurrentWeek);

    grid.innerHTML = '';
    $('empty-state').classList.toggle('hidden', habits.length > 0);
    if (!habits.length) return;

    const head = document.createElement('div');
    head.className = 'grid-head';
    head.appendChild(document.createElement('span'));
    for (let i = 0; i < 7; i++) {
      const d = Habits.addDays(currentWeekStart, i);
      const col = document.createElement('div');
      col.className = 'day-col' + (d.getTime() === todayD.getTime() ? ' today' : '');
      col.innerHTML = `${DAY_NAMES[i]}<span class="day-num">${d.getDate()}</span>`;
      head.appendChild(col);
    }
    grid.appendChild(head);

    for (const habit of habits) {
      grid.appendChild(renderRow(habit, todayD));
    }
  }

  function renderRow(habit, todayD) {
    const st = Habits.status(habit);
    const row = document.createElement('div');
    row.className = `habit-row status-${st.level}`;

    const info = document.createElement('div');
    info.className = 'habit-info';

    const handle = document.createElement('span');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Arrastrar para ordenar';
    handle.addEventListener('pointerdown', (e) => startDrag(e, row, handle));
    info.appendChild(handle);

    const badgeClass = { new: 'badge-new', building: 'badge-building', strong: 'badge-strong' }[st.level];
    const streakTxt = st.days > 0 ? `<span class="streak-flame">🔥 ${st.days}d</span>` : '';
    let progressTxt = '';
    if (habit.rule.type === 'weekly') {
      const done = Habits.doneCountInWeek(habit, currentWeekStart);
      progressTxt = `<span>${done}/${habit.rule.times}</span>`;
    }

    const text = document.createElement('div');
    text.className = 'habit-info-text';
    text.title = 'Editar hábito';
    text.innerHTML = `
      <div class="habit-name">${escapeHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="badge ${badgeClass}">${st.label}</span>
        ${streakTxt}
        ${progressTxt}
        <span>${Habits.ruleLabel(habit)}</span>
        ${habit.reminder && habit.reminder.enabled ? `<span>⏰ ${habit.reminder.time}</span>` : ''}
      </div>`;
    text.addEventListener('click', () => openHabitModal(habit.id));
    info.appendChild(text);
    row.appendChild(info);

    for (let i = 0; i < 7; i++) {
      const d = Habits.addDays(currentWeekStart, i);
      const cell = document.createElement('button');
      cell.className = 'day-cell';
      const done = Habits.isDone(habit, d);
      const scheduled = Habits.isScheduled(habit, d);
      const isFuture = d > todayD;

      if (done) { cell.classList.add('done'); cell.textContent = '✓'; }
      else if (!scheduled) { cell.classList.add('unscheduled'); cell.textContent = '·'; }
      if (d.getTime() === todayD.getTime()) cell.classList.add('today-cell');
      if (isFuture) {
        cell.classList.add('future');
        cell.disabled = true;
      } else {
        cell.addEventListener('click', () => {
          Habits.toggle(habit.id, d);
          render();
        });
      }
      row.appendChild(cell);
    }
    return row;
  }

  // ---- Drag & drop para ordenar ----
  function startDrag(e, row, handle) {
    e.preventDefault();
    const grid = $('habits-grid');
    const rows = [...grid.querySelectorAll('.habit-row')];
    const fromIndex = rows.indexOf(row);
    let curIndex = fromIndex;
    const startY = e.clientY;
    let baseShift = 0; // desplazamiento acumulado por swaps en el DOM

    row.classList.add('dragging');
    grid.classList.add('drag-active');
    try { handle.setPointerCapture(e.pointerId); } catch (_) {}

    const applyTransform = (dy) => {
      row.style.transform = `translateY(${dy - baseShift}px)`;
    };

    const onMove = (ev) => {
      const dy = ev.clientY - startY;
      applyTransform(dy);

      let next = row.nextElementSibling;
      while (next && next.classList.contains('habit-row')
             && (dy - baseShift) > next.offsetHeight / 2 + ROW_GAP) {
        next.after(row);
        baseShift += next.offsetHeight + ROW_GAP;
        curIndex++;
        applyTransform(dy);
        next = row.nextElementSibling;
      }
      let prev = row.previousElementSibling;
      while (prev && prev.classList.contains('habit-row')
             && (dy - baseShift) < -(prev.offsetHeight / 2 + ROW_GAP)) {
        prev.before(row);
        baseShift -= prev.offsetHeight + ROW_GAP;
        curIndex--;
        applyTransform(dy);
        prev = row.previousElementSibling;
      }
    };

    const onUp = () => {
      handle.removeEventListener('pointermove', onMove);
      handle.removeEventListener('pointerup', onUp);
      handle.removeEventListener('pointercancel', onUp);
      row.classList.remove('dragging');
      row.style.transform = '';
      grid.classList.remove('drag-active');
      if (curIndex !== fromIndex) Habits.move(fromIndex, curIndex);
      render();
    };

    handle.addEventListener('pointermove', onMove);
    handle.addEventListener('pointerup', onUp);
    handle.addEventListener('pointercancel', onUp);
  }

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---- Estadísticas ----
  function renderStats() {
    const view = $('view-stats');
    const habits = Habits.all();

    if (!habits.length) {
      view.innerHTML = `<div class="empty-state">
        <div class="empty-icon">📊</div>
        <p>Sin datos todavía.</p>
        <p class="muted">Creá hábitos y marcá tu progreso para ver estadísticas.</p>
      </div>`;
      return;
    }

    const t = Habits.today();
    const start30 = Habits.addDays(t, -29);
    let done30 = 0;
    let bestActive = 0;
    for (const h of habits) {
      done30 += Habits.rangeStats(h, start30, t).done;
      bestActive = Math.max(bestActive, Habits.streakDays(h));
    }

    view.innerHTML = `
      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-value">${habits.length}</div>
          <div class="stat-label">Hábitos activos</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${done30}</div>
          <div class="stat-label">Completados (30 días)</div>
        </div>
        <div class="stat-card">
          <div class="stat-value">${bestActive > 0 ? '🔥 ' + bestActive : '—'}</div>
          <div class="stat-label">Mejor racha activa (días)</div>
        </div>
      </div>

      <div class="stats-panel">
        <h3>Cumplimiento semanal — últimas 12 semanas</h3>
        <div class="chart-wrap" id="weekly-chart"></div>
      </div>

      <div class="stats-panel">
        <h3>Por hábito — últimos 30 días</h3>
        <div id="habit-stats-list"></div>
      </div>`;

    renderWeeklyChart($('weekly-chart'), Habits.weeklyCompletion(12));
    renderHabitStats($('habit-stats-list'), habits, start30, t);
  }

  // Barras SVG: % de cumplimiento por semana (una sola serie, hue acento)
  function renderWeeklyChart(container, weeks) {
    const W = 600, H = 210;
    const m = { top: 14, right: 8, bottom: 26, left: 34 };
    const iw = W - m.left - m.right;
    const ih = H - m.top - m.bottom;
    const n = weeks.length;
    const slot = iw / n;
    const barW = Math.min(30, slot - 6);

    const y = (pct) => m.top + ih * (1 - pct / 100);

    // barra con extremo superior redondeado, anclada a la línea base
    const barPath = (x, pct) => {
      const top = y(pct);
      const bottom = m.top + ih;
      const r = Math.min(4, (bottom - top) / 2, barW / 2);
      if (bottom - top < 1) return '';
      return `M${x},${bottom} L${x},${top + r} Q${x},${top} ${x + r},${top}` +
             ` L${x + barW - r},${top} Q${x + barW},${top} ${x + barW},${top + r}` +
             ` L${x + barW},${bottom} Z`;
    };

    let bars = '';
    weeks.forEach((w, i) => {
      const x = m.left + i * slot + (slot - barW) / 2;
      if (w.pct === null) return;
      const label = `${w.start.getDate()} ${MONTHS[w.start.getMonth()]}`;
      bars += `<path d="${barPath(x, w.pct)}" fill="#4f8cff"
        data-i="${i}" data-label="${label}" data-pct="${w.pct}" data-done="${w.done}" data-exp="${w.expected}"></path>`;
      // etiqueta directa solo en la semana actual
      if (i === weeks.length - 1) {
        bars += `<text x="${x + barW / 2}" y="${y(w.pct) - 6}" text-anchor="middle"
          font-size="12" font-weight="600" fill="#e8eaf0">${w.pct}%</text>`;
      }
    });

    let gridLines = '';
    for (const pct of [0, 50, 100]) {
      gridLines += `<line x1="${m.left}" y1="${y(pct)}" x2="${W - m.right}" y2="${y(pct)}"
        stroke="#2a2f3a" stroke-width="1"></line>
        <text x="${m.left - 6}" y="${y(pct) + 4}" text-anchor="end" font-size="11" fill="#8b91a0">${pct}</text>`;
    }

    let xLabels = '';
    weeks.forEach((w, i) => {
      if (i % 2 !== (weeks.length - 1) % 2) return; // etiquetas alternadas, siempre incluye la última
      const x = m.left + i * slot + slot / 2;
      xLabels += `<text x="${x}" y="${H - 8}" text-anchor="middle" font-size="10.5" fill="#8b91a0">
        ${w.start.getDate()} ${MONTHS[w.start.getMonth()]}</text>`;
    });

    container.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" role="img" aria-label="Cumplimiento semanal en porcentaje">
        ${gridLines}${bars}${xLabels}
      </svg>
      <div class="chart-tooltip hidden" id="chart-tip"></div>`;

    // tooltip por barra (hover y tap)
    const tip = container.querySelector('#chart-tip');
    const svg = container.querySelector('svg');
    container.querySelectorAll('path[data-pct]').forEach(bar => {
      const show = () => {
        tip.textContent = `Semana del ${bar.dataset.label}: ${bar.dataset.done}/${bar.dataset.exp} (${bar.dataset.pct}%)`;
        tip.classList.remove('hidden');
        const bb = bar.getBoundingClientRect();
        const cb = container.getBoundingClientRect();
        tip.style.left = (bb.left - cb.left + bb.width / 2) + 'px';
        tip.style.top = (bb.top - cb.top) + 'px';
      };
      bar.addEventListener('pointerenter', show);
      bar.addEventListener('pointerdown', show);
      bar.addEventListener('pointerleave', () => tip.classList.add('hidden'));
    });
    svg.addEventListener('pointerleave', () => tip.classList.add('hidden'));
  }

  function renderHabitStats(container, habits, start30, t) {
    container.innerHTML = habits.map(h => {
      const s = Habits.rangeStats(h, start30, t);
      const streak = Habits.streakDays(h);
      const best = Habits.bestStreakDays(h);
      const pct = s.pct === null ? 0 : s.pct;
      return `<div class="habit-stat-row">
        <div class="habit-stat-top">
          <span class="habit-stat-name">${escapeHtml(h.name)}</span>
          <span class="habit-stat-nums">🔥 ${streak}d · mejor ${best}d · ${s.done}/${s.expected} (${s.pct === null ? '—' : s.pct + '%'})</span>
        </div>
        <div class="progress-track" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100">
          <div class="progress-fill" style="width:${pct}%"></div>
        </div>
      </div>`;
    }).join('');
  }

  // ---- Modal de hábito ----
  function openHabitModal(habitId) {
    editingHabitId = habitId || null;
    const habit = habitId ? Habits.get(habitId) : null;

    $('habit-modal-title').textContent = habit ? 'Editar hábito' : 'Nuevo hábito';
    $('btn-delete-habit').classList.toggle('hidden', !habit);

    $('habit-name').value = habit ? habit.name : '';
    $('habit-rule-type').value = habit ? habit.rule.type : 'daily';
    $('habit-times').value = habit && habit.rule.type === 'weekly' ? habit.rule.times : 2;

    document.querySelectorAll('#day-picker input').forEach(cb => {
      cb.checked = !!(habit && habit.rule.type === 'days' && habit.rule.days.includes(Number(cb.value)));
    });

    const rem = habit && habit.reminder ? habit.reminder : { enabled: false, time: '09:00', alarm: false };
    $('habit-reminder-enabled').checked = rem.enabled;
    $('habit-reminder-time').value = rem.time || '09:00';
    $('habit-alarm-enabled').checked = !!rem.alarm;

    syncRuleFields();
    syncReminderFields();
    $('modal-habit').classList.remove('hidden');
    $('habit-name').focus();
  }

  function closeHabitModal() {
    $('modal-habit').classList.add('hidden');
    editingHabitId = null;
  }

  function syncRuleFields() {
    const type = $('habit-rule-type').value;
    $('field-times-per-week').classList.toggle('hidden', type !== 'weekly');
    $('field-days').classList.toggle('hidden', type !== 'days');
  }

  function syncReminderFields() {
    const enabled = $('habit-reminder-enabled').checked;
    $('field-reminder-time').classList.toggle('hidden', !enabled);
    $('field-alarm').classList.toggle('hidden', !enabled);
  }

  async function saveHabitFromForm(e) {
    e.preventDefault();
    const type = $('habit-rule-type').value;
    let rule;
    if (type === 'weekly') {
      rule = { type, times: Math.min(7, Math.max(1, Number($('habit-times').value) || 1)) };
    } else if (type === 'days') {
      const days = [...document.querySelectorAll('#day-picker input:checked')].map(cb => Number(cb.value));
      if (!days.length) { toast('Elegí al menos un día'); return; }
      rule = { type, days };
    } else {
      rule = { type: 'daily' };
    }

    const reminder = {
      enabled: $('habit-reminder-enabled').checked,
      time: $('habit-reminder-time').value || '09:00',
      alarm: $('habit-alarm-enabled').checked,
    };

    const data = { name: $('habit-name').value.trim(), rule, reminder };
    if (!data.name) return;

    if (editingHabitId) Habits.update(editingHabitId, data);
    else Habits.create(data);

    if (reminder.enabled && Notifications.permission() === 'default') {
      await Notifications.requestPermission();
    }

    closeHabitModal();
    showView('home');
  }

  // ---- Modal de configuración ----
  function openSettings() {
    $('drive-client-id').value = Storage.load().settings.driveClientId || '';
    refreshNotifStatus();
    $('modal-settings').classList.remove('hidden');
  }

  function refreshNotifStatus() {
    const p = Notifications.permission();
    const map = {
      granted: '✅ Notificaciones activadas',
      denied: '🚫 Notificaciones bloqueadas — habilitalas en los ajustes del navegador',
      default: 'Notificaciones sin activar todavía',
      unsupported: 'Este navegador no soporta notificaciones',
    };
    $('notif-status').textContent = map[p];
    $('btn-enable-notifs').classList.toggle('hidden', p !== 'default');
  }

  function saveClientId() {
    const data = Storage.load();
    data.settings.driveClientId = $('drive-client-id').value.trim();
    Storage.save();
  }

  // ---- Wire de eventos ----
  function init() {
    render();

    // navegación inferior
    $('nav-home').addEventListener('click', () => showView('home'));
    $('nav-stats').addEventListener('click', () => showView('stats'));
    $('nav-settings').addEventListener('click', openSettings);
    $('btn-add-habit').addEventListener('click', () => openHabitModal(null));

    $('btn-cancel-habit').addEventListener('click', closeHabitModal);
    $('form-habit').addEventListener('submit', saveHabitFromForm);
    $('habit-rule-type').addEventListener('change', syncRuleFields);
    $('habit-reminder-enabled').addEventListener('change', syncReminderFields);

    $('btn-delete-habit').addEventListener('click', () => {
      if (editingHabitId && confirm('¿Eliminar este hábito y todo su historial?')) {
        Habits.remove(editingHabitId);
        closeHabitModal();
        render();
      }
    });

    $('btn-prev-week').addEventListener('click', () => {
      currentWeekStart = Habits.addDays(currentWeekStart, -7);
      render();
    });
    $('btn-next-week').addEventListener('click', () => {
      currentWeekStart = Habits.addDays(currentWeekStart, 7);
      render();
    });
    $('btn-today').addEventListener('click', () => {
      currentWeekStart = Habits.weekStart(Habits.today());
      render();
    });

    // Configuración
    $('btn-settings').addEventListener('click', openSettings);
    $('btn-close-settings').addEventListener('click', () => {
      saveClientId();
      $('modal-settings').classList.add('hidden');
    });
    $('btn-enable-notifs').addEventListener('click', async () => {
      await Notifications.requestPermission();
      refreshNotifStatus();
    });

    // Drive
    $('btn-drive-export').addEventListener('click', async () => {
      saveClientId();
      const status = $('drive-status');
      status.textContent = 'Exportando…';
      try {
        await Drive.exportBackup();
        status.textContent = '✅ Backup exportado a Google Drive';
      } catch (err) {
        status.textContent = '❌ ' + err.message;
      }
    });
    $('btn-drive-import').addEventListener('click', async () => {
      saveClientId();
      if (!confirm('Esto reemplaza todos los datos actuales con el backup de Drive. ¿Continuar?')) return;
      const status = $('drive-status');
      status.textContent = 'Importando…';
      try {
        const when = await Drive.importBackup();
        status.textContent = `✅ Backup restaurado (${new Date(when).toLocaleString()})`;
        render();
      } catch (err) {
        status.textContent = '❌ ' + err.message;
      }
    });

    // Backup por archivo
    $('btn-file-export').addEventListener('click', () => {
      const blob = new Blob([Storage.exportJSON()], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `habits-backup-${Habits.dateKey(new Date())}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
    $('btn-file-import').addEventListener('click', () => $('file-import-input').click());
    $('file-import-input').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!confirm('Esto reemplaza todos los datos actuales con el backup del archivo. ¿Continuar?')) {
        e.target.value = '';
        return;
      }
      try {
        Storage.importJSON(await file.text());
        toast('✅ Backup restaurado');
        render();
      } catch (err) {
        toast('❌ ' + err.message);
      }
      e.target.value = '';
    });

    // Alarma
    $('btn-stop-alarm').addEventListener('click', () => Notifications.stopAlarm());
    $('btn-done-alarm').addEventListener('click', () => {
      const habitId = Notifications.stopAlarm();
      if (habitId) {
        const habit = Habits.get(habitId);
        if (habit && !Habits.isDone(habit, new Date())) {
          Habits.toggle(habitId, new Date());
        }
        render();
      }
    });

    // cerrar modales tocando el fondo
    document.querySelectorAll('.modal-backdrop').forEach(bd => {
      bd.addEventListener('click', (e) => {
        if (e.target === bd) bd.classList.add('hidden');
      });
    });

    // re-render al cambiar de día con la app abierta
    setInterval(() => {
      const nowWeek = Habits.weekStart(Habits.today()).getTime();
      if (currentView === 'home' && nowWeek !== currentWeekStart.getTime()
          && $('btn-today').classList.contains('hidden')) {
        currentWeekStart = new Date(nowWeek);
        render();
      }
    }, 60000);
  }

  return { init, render, toast };
})();
