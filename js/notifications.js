/* Recordatorios (Notification API) y alarmas sonoras (WebAudio).
 *
 * Limitación honesta de las PWA: sin un servidor de push, el navegador solo
 * permite disparar notificaciones/sonido mientras la app está viva (pestaña
 * abierta o PWA instalada en segundo plano). Para minimizar el throttling de
 * timers en segundo plano usamos un Web Worker como reloj.
 */
const Notifications = (() => {
  let audioCtx = null;
  let alarmTimer = null;
  let alarmActive = null; // id del hábito con alarma sonando

  // ---- Permisos ----
  function permission() {
    return ('Notification' in window) ? Notification.permission : 'unsupported';
  }

  async function requestPermission() {
    if (!('Notification' in window)) return 'unsupported';
    return await Notification.requestPermission();
  }

  // ---- Reloj en Web Worker (menos throttling que setInterval en la página) ----
  function startClock() {
    const src = 'setInterval(() => postMessage(1), 15000);';
    try {
      const worker = new Worker(URL.createObjectURL(new Blob([src], { type: 'text/javascript' })));
      worker.onmessage = () => check();
    } catch (e) {
      setInterval(check, 15000);
    }
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) check();
    });
    check();
  }

  // ---- Chequeo de recordatorios ----
  function check() {
    const data = Storage.load();
    const now = new Date();
    const todayKey = Habits.dateKey(now);
    const minutesNow = now.getHours() * 60 + now.getMinutes();

    for (const habit of data.habits) {
      const rem = habit.reminder;
      if (!rem || !rem.enabled || !rem.time) continue;
      if (!Habits.isScheduled(habit, now)) continue;
      if (Habits.isDone(habit, now)) continue;
      if (data.lastNotified[habit.id] === todayKey) continue;

      const [h, m] = rem.time.split(':').map(Number);
      if (minutesNow < h * 60 + m) continue;

      data.lastNotified[habit.id] = todayKey;
      Storage.save();
      fireReminder(habit);
    }
  }

  async function fireReminder(habit) {
    const title = `${habit.emoji || '⏰'} ${habit.name}`;
    const body = habit.reminder.alarm
      ? '¡Es hora! Tocá para detener la alarma.'
      : 'Recordatorio: todavía no marcaste este hábito hoy.';

    if (permission() === 'granted') {
      try {
        const reg = await navigator.serviceWorker.getRegistration();
        if (reg) {
          await reg.showNotification(title, {
            body,
            icon: 'icons/icon-192.png',
            badge: 'icons/icon-192.png',
            tag: 'habit-' + habit.id,
            requireInteraction: !!habit.reminder.alarm,
            vibrate: habit.reminder.alarm ? [400, 150, 400, 150, 800] : [200],
            data: { habitId: habit.id, alarm: !!habit.reminder.alarm },
          });
        } else {
          new Notification(title, { body, icon: 'icons/icon-192.png' });
        }
      } catch (e) {
        console.error('No se pudo mostrar la notificación', e);
      }
    }

    if (habit.reminder.alarm) startAlarm(habit);
  }

  // ---- Alarma sonora ----
  function ensureAudio() {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
    return audioCtx;
  }

  function beepPattern() {
    const ctx = ensureAudio();
    const t0 = ctx.currentTime;
    // dos tonos alternados estilo alarma de celular
    [[880, 0], [1175, 0.25], [880, 0.5], [1175, 0.75]].forEach(([freq, offset]) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'square';
      osc.frequency.value = freq;
      gain.gain.setValueAtTime(0.0001, t0 + offset);
      gain.gain.exponentialRampToValueAtTime(0.28, t0 + offset + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t0 + offset + 0.2);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t0 + offset);
      osc.stop(t0 + offset + 0.22);
    });
  }

  function startAlarm(habit) {
    if (alarmActive) return;
    alarmActive = habit.id;

    document.getElementById('alarm-habit-name').textContent =
      `${habit.emoji || ''} ${habit.name}`.trim();
    document.getElementById('alarm-overlay').classList.remove('hidden');

    try {
      beepPattern();
      alarmTimer = setInterval(beepPattern, 1200);
    } catch (e) {
      // autoplay bloqueado: queda el overlay visual + vibración
      console.warn('Audio bloqueado hasta interacción del usuario', e);
    }
    if (navigator.vibrate) navigator.vibrate([400, 150, 400, 150, 800]);
  }

  function stopAlarm() {
    if (alarmTimer) clearInterval(alarmTimer);
    alarmTimer = null;
    const id = alarmActive;
    alarmActive = null;
    if (navigator.vibrate) navigator.vibrate(0);
    document.getElementById('alarm-overlay').classList.add('hidden');
    return id;
  }

  // Si la app se abre desde una notificación con alarma (?alarm=<habitId>)
  function handleLaunchParams() {
    const params = new URLSearchParams(location.search);
    const habitId = params.get('alarm');
    if (habitId) {
      const habit = Habits.get(habitId);
      if (habit && !Habits.isDone(habit, new Date())) startAlarm(habit);
      history.replaceState(null, '', location.pathname);
    }
  }

  return { permission, requestPermission, startClock, check, startAlarm, stopAlarm, handleLaunchParams };
})();
