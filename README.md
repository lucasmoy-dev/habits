# Hábitos 🌱

PWA de gestión de hábitos con vista semanal, rachas, recordatorios y alarmas.
100% estática (HTML/CSS/JS vanilla), sin build ni servidor: se sirve directo
desde GitHub Pages y guarda todo en `localStorage`.

**App online:** https://lucasmoy-dev.github.io/habits/

## Funcionalidades

- **Grilla semanal** (lunes a domingo): tocá una celda para marcar el hábito como hecho ese día.
- **Menú inferior** con Inicio, Estadísticas, botón central de agregar y Ajustes.
- **Estadísticas**: hábitos activos, completados en 30 días, mejor racha activa,
  gráfico de cumplimiento semanal (últimas 12 semanas) y desglose por hábito
  (racha actual, mejor racha histórica, % de cumplimiento).
- **Ordenar hábitos** arrastrándolos desde el asa ⠿ (mouse o touch).
- **Reglas de frecuencia** por hábito:
  - Todos los días
  - X veces por semana (muestra progreso `2/3`)
  - Días específicos (ej: lunes y miércoles)
- **Estado de integración** según la racha actual:
  - 🔵 **Nuevo / en integración** — racha menor a 7 días
  - 🟡 **Construyendo** — racha de 7 a 29 días
  - 🟢 **Integrado** — racha de 30+ días (fila resaltada en verde)
- **Recordatorios**: notificación a la hora configurada si el hábito sigue pendiente.
- **Alarma** 🔔 opcional por hábito: sonido estilo alarma de celular + vibración + overlay
  para detenerla o marcar el hábito como hecho.
- **Backup en Google Drive** (evento puntual de exportar/importar, no queda conectado)
  y también backup por archivo local.
- Dark mode, responsive, instalable como PWA y funciona offline.

## Instalación como app

Abrí la URL en el celular → menú del navegador → **"Agregar a pantalla de inicio"**.

## Configurar backup en Google Drive

El backup usa tu propia credencial de Google (no hay servidor de por medio):

1. Entrá a [Google Cloud Console → Credentials](https://console.cloud.google.com/apis/credentials).
2. Creá un proyecto (si no tenés) y habilitá la **Google Drive API**.
3. Creá una credencial **OAuth client ID** de tipo **Web application**.
4. En *Authorized JavaScript origins* agregá: `https://lucasmoy-dev.github.io`
5. Copiá el Client ID (`xxxx.apps.googleusercontent.com`) y pegalo en
   **Configuración → Google OAuth Client ID** dentro de la app.

El backup se guarda en la carpeta oculta de la app en tu Drive (`appDataFolder`),
no ensucia tu Drive visible.

## Limitaciones de notificaciones/alarmas en PWA

Sin un servidor de push, el navegador solo permite disparar notificaciones y sonido
**mientras la app está viva** (pestaña abierta o PWA instalada corriendo en segundo
plano). Si el sistema mata la app, el recordatorio se dispara al volver a abrirla.
Para mejor resultado en Android: instalá la PWA y dejala abierta.

## Desarrollo local

```bash
python3 -m http.server 8080
# abrir http://localhost:8080
```
