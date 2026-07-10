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
    h.rule = data.rule;
    h.reminder = data.reminder;
    Storage.save();
    return h;
  }

  // mueve el hábito de una posición a otra (drag & drop)
  function move(fromIndex, toIndex) {
    const habits = all();
    if (fromIndex === toIndex || fromIndex < 0 || toIndex < 0
        || fromIndex >= habits.length || toIndex >= habits.length) return;
    const [h] = habits.splice(fromIndex, 1);
    habits.splice(toIndex, 0, h);
    Storage.save();
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

  // Mejor racha histórica en días calendario
  function bestStreakDays(habit) {
    const t = today();
    const created = new Date(habit.createdAt + 'T00:00:00');

    if (habit.rule.type === 'weekly') {
      const times = habit.rule.times || 1;
      let best = 0, run = 0;
      for (let ws = weekStart(created); ws <= t; ws = addDays(ws, 7)) {
        const isCurrent = ws.getTime() === weekStart(t).getTime();
        if (doneCountInWeek(habit, ws) >= times) {
          run++;
          best = Math.max(best, run);
        } else if (!isCurrent) {
          run = 0; // la semana en curso pendiente no corta
        }
      }
      return best * 7;
    }

    let best = 0, runStart = null;
    for (let d = new Date(created); d <= t; d = addDays(d, 1)) {
      if (!isScheduled(habit, d)) continue;
      if (isDone(habit, d)) {
        if (!runStart) runStart = new Date(d);
        best = Math.max(best, Math.round((d - runStart) / 86400000) + 1);
      } else if (d.getTime() !== t.getTime()) {
        runStart = null; // hoy pendiente no corta
      }
    }
    return best;
  }

  // Cumplimiento en un rango [start, end] (inclusive): hecho vs. esperado
  function rangeStats(habit, start, end) {
    const t = today();
    const created = new Date(habit.createdAt + 'T00:00:00');
    const from = created > start ? created : new Date(start);
    const to = t < end ? t : new Date(end);
    if (from > to) return { done: 0, expected: 0, pct: null };

    let done = 0, expected = 0;
    const dayCount = Math.round((to - from) / 86400000) + 1;

    if (habit.rule.type === 'weekly') {
      const times = habit.rule.times || 1;
      expected = Math.ceil(times * dayCount / 7);
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if (isDone(habit, d)) done++;
      }
    } else {
      for (let d = new Date(from); d <= to; d = addDays(d, 1)) {
        if (!isScheduled(habit, d)) continue;
        expected++;
        if (isDone(habit, d)) done++;
      }
    }
    const pct = expected > 0 ? Math.min(100, Math.round(done / expected * 100)) : null;
    return { done: Math.min(done, expected), expected, pct };
  }

  // Cumplimiento global por semana, últimas nWeeks (incluye la actual, parcial)
  function weeklyCompletion(nWeeks) {
    const habits = all();
    const thisWeek = weekStart(today());
    const result = [];
    for (let i = nWeeks - 1; i >= 0; i--) {
      const ws = addDays(thisWeek, -7 * i);
      const we = addDays(ws, 6);
      let done = 0, expected = 0;
      for (const h of habits) {
        const s = rangeStats(h, ws, we);
        done += s.done;
        expected += s.expected;
      }
      result.push({
        start: ws,
        done, expected,
        pct: expected > 0 ? Math.round(done / expected * 100) : null,
      });
    }
    return result;
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
    all, get, create, update, remove, toggle, move,
    isDone, isScheduled, doneCountInWeek,
    streakDays, bestStreakDays, rangeStats, weeklyCompletion,
    status, ruleLabel,
  };
})();
