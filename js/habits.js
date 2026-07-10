/* Lógica de hábitos: reglas, rachas y estado de integración. */
const Habits = (() => {

  // ---- Fechas (todo en hora local) ----
  function dateKey(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function today() {
    const d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  function addDays(d, n) {
    const r = new Date(d);
    r.setDate(r.getDate() + n);
    return r;
  }

  // Lunes de la semana de `d`
  function weekStart(d) {
    const r = new Date(d);
    r.setHours(0, 0, 0, 0);
    const dow = (r.getDay() + 6) % 7; // 0 = lunes
    return addDays(r, -dow);
  }

  // ---- CRUD ----
  function all() {
    return Storage.load().habits;
  }

  function get(id) {
    return all().find(h => h.id === id);
  }

  function create(data) {
    const habit = {
      id: 'h' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      name: data.name,
      emoji: data.emoji || '',
      rule: data.rule,               // {type:'daily'} | {type:'weekly', times:n} | {type:'days', days:[0-6]}
      reminder: data.reminder,       // {enabled, time:'HH:MM', alarm:bool}
      createdAt: dateKey(today()),
      log: {},                       // {'YYYY-MM-DD': true}
    };
    all().push(habit);
    Storage.save();
    return habit;
  }

  function update(id, data) {
    const h = get(id);
    if (!h) return;
    h.name = data.name;
    h.emoji = data.emoji || '';
    h.rule = data.rule;
    h.reminder = data.reminder;
    Storage.save();
    return h;
  }

  function remove(id) {
    const data = Storage.load();
    data.habits = data.habits.filter(h => h.id !== id);
    delete data.lastNotified[id];
    Storage.save();
  }

  function toggle(id, date) {
    const h = get(id);
    if (!h) return;
    const key = dateKey(date);
    if (h.log[key]) delete h.log[key];
    else h.log[key] = true;
    Storage.save();
  }

  function isDone(habit, date) {
    return !!habit.log[dateKey(date)];
  }

  // ---- Reglas ----
  function isScheduled(habit, date) {
    const r = habit.rule;
    if (r.type === 'daily') return true;
    if (r.type === 'days') return r.days.includes(date.getDay());
    return true; // weekly: cualquier día suma al objetivo semanal
  }

  function doneCountInWeek(habit, wStart) {
    let count = 0;
    for (let i = 0; i < 7; i++) {
      if (isDone(habit, addDays(wStart, i))) count++;
    }
    return count;
  }

  // ---- Rachas ----
  // Devuelve la cantidad de días calendario que lleva la racha actual.
  // No rompe la racha por el día/semana en curso todavía pendiente.
  function streakDays(habit) {
    const t = today();
    const created = new Date(habit.createdAt + 'T00:00:00');
    const MAX_LOOKBACK = 450;

    if (habit.rule.type === 'weekly') {
      const times = habit.rule.times || 1;
      let ws = weekStart(t);
      let earliest = null;

      // Semana actual: cuenta si ya cumplió el objetivo, si no queda pendiente
      if (doneCountInWeek(habit, ws) >= times) earliest = ws;

      for (let i = 1; i < Math.ceil(MAX_LOOKBACK / 7); i++) {
        const prev = addDays(ws, -7 * i);
        if (addDays(prev, 6) < created) break; // semana anterior a la creación
        if (doneCountInWeek(habit, prev) >= times) earliest = prev;
        else break;
      }
      if (!earliest) return 0;
      return Math.round((t - earliest) / 86400000) + 1;
    }

    // daily / days: recorre hacia atrás día por día
    let earliest = null;
    for (let i = 0; i < MAX_LOOKBACK; i++) {
      const d = addDays(t, -i);
      if (d < created) break;
      if (!isScheduled(habit, d)) continue;
      if (isDone(habit, d)) {
        earliest = d;
      } else {
        if (i === 0) continue; // hoy todavía pendiente, no rompe
        break;
      }
    }
    if (!earliest) return 0;
    return Math.round((t - earliest) / 86400000) + 1;
  }

  // Estado de integración según la racha
  function status(habit) {
    const days = streakDays(habit);
    if (days >= 30) return { level: 'strong', label: 'Integrado', days };
    if (days >= 7) return { level: 'building', label: 'En progreso', days };
    return { level: 'new', label: 'Nuevo', days };
  }

  function ruleLabel(habit) {
    const r = habit.rule;
    if (r.type === 'daily') return 'Todos los días';
    if (r.type === 'weekly') return `${r.times}× por semana`;
    const names = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    const order = [1, 2, 3, 4, 5, 6, 0]; // mostrar L..D
    return order.filter(d => r.days.includes(d)).map(d => names[d]).join(' · ');
  }

  return {
    dateKey, today, addDays, weekStart,
    all, get, create, update, remove, toggle,
    isDone, isScheduled, doneCountInWeek,
    streakDays, status, ruleLabel,
  };
})();
