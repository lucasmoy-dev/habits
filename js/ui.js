/* Render de la grilla semanal, modales y eventos de UI. */
const UI = (() => {
  const DAY_NAMES = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
  const MONTHS = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sep', 'oct', 'nov', 'dic'];

  let currentWeekStart = Habits.weekStart(Habits.today());
  let editingHabitId = null;

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

  // ---- Grilla semanal ----
  function render() {
    const grid = $('habits-grid');
    const habits = Habits.all();
    const todayD = Habits.today();
    const isCurrentWeek = currentWeekStart.getTime() === Habits.weekStart(todayD).getTime();

    // etiqueta de semana
    const wEnd = Habits.addDays(currentWeekStart, 6);
    $('week-label').textContent =
      `${currentWeekStart.getDate()} ${MONTHS[currentWeekStart.getMonth()]} – ${wEnd.getDate()} ${MONTHS[wEnd.getMonth()]} ${wEnd.getFullYear()}`;
    $('btn-today').classList.toggle('hidden', isCurrentWeek);

    grid.innerHTML = '';
    $('empty-state').classList.toggle('hidden', habits.length > 0);
    if (!habits.length) return;

    // cabecera de días
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

    // filas de hábitos
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
    info.title = 'Editar hábito';

    const badgeClass = { new: 'badge-new', building: 'badge-building', strong: 'badge-strong' }[st.level];
    const streakTxt = st.days > 0 ? `<span class="streak-flame">🔥 ${st.days}d</span>` : '';
    let progressTxt = '';
    if (habit.rule.type === 'weekly') {
      const done = Habits.doneCountInWeek(habit, currentWeekStart);
      progressTxt = `<span>${done}/${habit.rule.times}</span>`;
    }

    info.innerHTML = `
      <div class="habit-name">${habit.emoji ? habit.emoji + ' ' : ''}${escapeHtml(habit.name)}</div>
      <div class="habit-meta">
        <span class="badge ${badgeClass}">${st.label}</span>
        ${streakTxt}
        ${progressTxt}
        <span>${Habits.ruleLabel(habit)}</span>
        ${habit.reminder && habit.reminder.enabled ? `<span>⏰ ${habit.reminder.time}</span>` : ''}
      </div>`;
    info.addEventListener('click', () => openHabitModal(habit.id));
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

  function escapeHtml(s) {
    const div = document.createElement('div');
    div.textContent = s;
    return div.innerHTML;
  }

  // ---- Modal de hábito ----
  function openHabitModal(habitId) {
    editingHabitId = habitId || null;
    const habit = habitId ? Habits.get(habitId) : null;

    $('habit-modal-title').textContent = habit ? 'Editar hábito' : 'Nuevo hábito';
    $('btn-delete-habit').classList.toggle('hidden', !habit);

    $('habit-name').value = habit ? habit.name : '';
    $('habit-emoji').value = habit ? habit.emoji : '';
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

    const data = { name: $('habit-name').value.trim(), emoji: $('habit-emoji').value.trim(), rule, reminder };
    if (!data.name) return;

    if (editingHabitId) Habits.update(editingHabitId, data);
    else Habits.create(data);

    if (reminder.enabled && Notifications.permission() === 'default') {
      await Notifications.requestPermission();
    }

    closeHabitModal();
    render();
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
      if (document.querySelector('.grid-head') && nowWeek !== currentWeekStart.getTime()
          && $('btn-today').classList.contains('hidden')) {
        currentWeekStart = new Date(nowWeek);
        render();
      }
    }, 60000);
  }

  return { init, render, toast };
})();
