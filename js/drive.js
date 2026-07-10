/* Backup en Google Drive (carpeta oculta appDataFolder de la app).
 * Usa Google Identity Services: solo pide token en el momento de exportar/importar.
 * Requiere un OAuth Client ID configurado por el usuario en Configuración.
 */
const Drive = (() => {
  const SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
  const FILE_NAME = 'habits-backup.json';
  let tokenClient = null;
  let accessToken = null;

  function getClientId() {
    return (Storage.load().settings.driveClientId || '').trim();
  }

  function requestToken() {
    return new Promise((resolve, reject) => {
      const clientId = getClientId();
      if (!clientId) {
        reject(new Error('Configurá primero tu Google OAuth Client ID.'));
        return;
      }
      if (!(window.google && google.accounts && google.accounts.oauth2)) {
        reject(new Error('No se pudo cargar Google Identity Services (¿sin conexión?).'));
        return;
      }
      tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: clientId,
        scope: SCOPE,
        callback: (resp) => {
          if (resp.error) reject(new Error('Autorización rechazada: ' + resp.error));
          else { accessToken = resp.access_token; resolve(accessToken); }
        },
      });
      tokenClient.requestAccessToken({ prompt: '' });
    });
  }

  async function api(path, options = {}) {
    const res = await fetch('https://www.googleapis.com' + path, {
      ...options,
      headers: {
        Authorization: 'Bearer ' + accessToken,
        ...(options.headers || {}),
      },
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Drive API ${res.status}: ${text.slice(0, 200)}`);
    }
    return res;
  }

  async function findBackupFile() {
    const q = encodeURIComponent(`name = '${FILE_NAME}'`);
    const res = await api(`/drive/v3/files?spaces=appDataFolder&q=${q}&fields=files(id,name,modifiedTime)&orderBy=modifiedTime desc`);
    const json = await res.json();
    return json.files && json.files[0];
  }

  async function exportBackup() {
    await requestToken();
    const content = Storage.exportJSON();
    const existing = await findBackupFile();

    const metadata = existing
      ? { name: FILE_NAME }
      : { name: FILE_NAME, parents: ['appDataFolder'] };

    const boundary = 'habits_boundary_2718';
    const body =
      `--${boundary}\r\n` +
      'Content-Type: application/json; charset=UTF-8\r\n\r\n' +
      JSON.stringify(metadata) + '\r\n' +
      `--${boundary}\r\n` +
      'Content-Type: application/json\r\n\r\n' +
      content + '\r\n' +
      `--${boundary}--`;

    const path = existing
      ? `/upload/drive/v3/files/${existing.id}?uploadType=multipart`
      : '/upload/drive/v3/files?uploadType=multipart';

    await api(path, {
      method: existing ? 'PATCH' : 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    });
    return new Date().toLocaleString();
  }

  async function importBackup() {
    await requestToken();
    const existing = await findBackupFile();
    if (!existing) throw new Error('No hay ningún backup en tu Drive todavía.');
    const res = await api(`/drive/v3/files/${existing.id}?alt=media`);
    const text = await res.text();
    Storage.importJSON(text);
    return existing.modifiedTime;
  }

  return { exportBackup, importBackup, getClientId };
})();
