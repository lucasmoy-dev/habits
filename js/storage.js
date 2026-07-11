/* Capa de persistencia sobre localStorage. */
const Storage = (() => {
  const KEY = 'habits-app-data';
  const VERSION = 1;

  const defaults = () => ({
    version: VERSION,
    habits: [],
    categories: [],                  // [{id, name}]
    settings: {
      driveClientId: '',
    },
    // por hábito: fecha (YYYY-MM-DD) de la última notificación disparada
    lastNotified: {},
  });

  let cache = null;

  function load() {
    if (cache) return cache;
    try {
      const raw = localStorage.getItem(KEY);
      cache = raw ? Object.assign(defaults(), JSON.parse(raw)) : defaults();
      migrate(cache);
    } catch (e) {
      console.error('Error leyendo localStorage', e);
      cache = defaults();
    }
    return cache;
  }

  // migración: el campo emoji se fusiona dentro del nombre
  function migrate(data) {
    let changed = false;
    for (const h of data.habits) {
      if (h.emoji) {
        h.name = (h.emoji + ' ' + h.name).trim();
        delete h.emoji;
        changed = true;
      }
    }
    if (changed) save();
  }

  function save() {
    localStorage.setItem(KEY, JSON.stringify(cache));
  }

  function exportJSON() {
    return JSON.stringify({ ...load(), exportedAt: new Date().toISOString() }, null, 2);
  }

  function importJSON(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.habits)) {
      throw new Error('El archivo no tiene el formato esperado');
    }
    cache = Object.assign(defaults(), data, { version: VERSION });
    save();
    return cache;
  }

  return { load, save, exportJSON, importJSON };
})();
