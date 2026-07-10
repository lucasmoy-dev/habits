/* Punto de entrada. */
(function () {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('sw.js').catch(err => {
      console.warn('Service worker no registrado', err);
    });

    // click en una notificación con la app ya abierta → disparar alarma
    navigator.serviceWorker.addEventListener('message', (e) => {
      if (e.data && e.data.type === 'notification-click' && e.data.alarm) {
        const habit = Habits.get(e.data.habitId);
        if (habit && !Habits.isDone(habit, new Date())) Notifications.startAlarm(habit);
      }
    });
  }

  UI.init();
  Notifications.handleLaunchParams();
  Notifications.startClock();
})();
