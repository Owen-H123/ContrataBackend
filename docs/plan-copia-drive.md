# Plan: copia automática de fotos a Google Drive

> Estado: **planificado, sin implementar**. Pendiente: confirmar el tipo de cuenta de Google de RYSCOM (Workspace o Gmail con Google One).

## Objetivo

Que las fotos de cada informe finalizado queden también en el Drive de RYSCOM (≈1 TB disponible), para:

1. **Respaldo** fuera de Cloudflare R2: hoy no hay copia de las fotos ni de la base de datos.
2. **Entrega**: RYSCOM ve las fotos en su Drive sin entrar al sistema.

## Decisión: R2 sigue siendo el almacenamiento principal

Drive **no reemplaza** a R2, se agrega como copia.

| Motivo | Detalle |
|---|---|
| Subida en campo | El celular sube directo a R2 con enlaces firmados: rápido y tolera mala señal. Con Drive las fotos tendrían que pasar por el backend. |
| Drive no es almacenamiento de apps | La API tiene cuotas y es más lenta; con varios técnicos subiendo a la vez sería frágil. |
| Cuentas | Las cuentas de servicio no tienen cuota propia de Drive: se necesita una unidad compartida (Workspace) u OAuth de un usuario. |
| Costo | R2 cuesta poco a este volumen (10 GB gratis; luego US$ 0.015/GB-mes según la tarifa oficial consultada el 16-11-2026). |

## Flujo

1. Un informe pasa a **FINALIZADO**.
2. El backend lanza la copia **en segundo plano**: finalizar sigue respondiendo al instante.
3. Se crea (o reutiliza) la carpeta del informe dentro de la carpeta raíz configurada:

   ```
   RYSCOM Informes/
   └── PE-03-LA-05977-06 – OC 4555555555/
       ├── Fotos generales/
       ├── EPP/<técnico>/
       └── Actividades/010 CAMBIO DE GRILLETE/
           ├── Antes/001.jpg …
           ├── Durante/
           └── Finalizado/
   ```

   Misma estructura y orden que el ZIP (`rutasEnZip` en `evidencias.service.ts`). Solo fotos confirmadas y visibles; las descartadas no se copian.

4. Cada foto se lee de R2 y se sube a Drive **de a una**, en streaming (sin cargar todo en memoria), igual que el ZIP.
5. Se guarda en el informe el ID de la carpeta y el estado de la copia.

### Reaperturas

Si el informe se reabre y se vuelve a finalizar, se **reemplaza el contenido** de la misma carpeta (no se duplica y no quedan fotos descartadas).

### Fallos

- Drive caído o sin permisos: el informe queda finalizado igual; las fotos siguen seguras en R2.
- Se registra el error en los logs y se marca el estado `ERROR`.
- El ADMIN ve el estado en el detalle del informe y tiene un botón **Reintentar copia**.
- Sin las variables de Google, la función queda apagada (mismo criterio que R2).

## Cambios técnicos

### Backend

- Dependencia `googleapis`.
- `services/drive/drive.service.ts`: crear carpetas, subir archivo en streaming, vaciar carpeta.
- Variables en `env.schema.ts` (opcionales, todas o ninguna):
  - Workspace: `GOOGLE_DRIVE_CREDENTIALS` (JSON de la cuenta de servicio) y `GOOGLE_DRIVE_FOLDER_ID`.
  - Gmail: `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET`, `GOOGLE_OAUTH_REFRESH_TOKEN` y `GOOGLE_DRIVE_FOLDER_ID`.
- Migración en `informes`: `drive_carpeta_id` (varchar, nullable), `drive_estado` (enum `PENDIENTE` | `COPIADO` | `ERROR`, nullable), `drive_copiado_en` (timestamptz, nullable).
- `InformesService.finalizar`: dispara la copia sin esperarla.
- Endpoint `POST /informes/:id/drive` (ADMIN) para reintentar.
- Exponer `driveEstado` y el enlace a la carpeta en `InformeDetalle` (solo ADMIN y SUPERVISOR).

### Frontend

- Indicador en el detalle del informe: «Copiado a Drive ✓ / Pendiente / Error», enlace a la carpeta y botón **Reintentar copia** para ADMIN.

## Configuración en Google (la hace quien administra la cuenta de RYSCOM)

### Opción A: Google Workspace (recomendada)

1. console.cloud.google.com → crear proyecto «Contrata».
2. APIs y servicios → Biblioteca → activar **Google Drive API**.
3. IAM → Cuentas de servicio → crear `contrata-drive` → Claves → crear clave **JSON**.
4. En Drive, crear la unidad compartida **RYSCOM Informes** y agregar el correo de la cuenta de servicio como **Administrador de contenido**.
5. En Railway (servicio ContrataBackend): `GOOGLE_DRIVE_CREDENTIALS` y `GOOGLE_DRIVE_FOLDER_ID`.

### Opción B: Gmail con Google One

Pasos 1 y 2 iguales; en vez de cuenta de servicio se crea un **cliente OAuth**, se autoriza la cuenta una vez y se guarda el refresh token en Railway. Es más frágil: si se revoca el acceso, la copia se detiene hasta reconectar.

> El JSON y los tokens son credenciales: solo van en Railway, **nunca** en el repositorio ni en chats.

## Pasos

1. Confirmar el tipo de cuenta (Workspace o Gmail).
2. Implementar en una rama y probar contra una carpeta de prueba.
3. Configurar Google y las variables en Railway.
4. Merge, desplegar backend y luego frontend.
5. Finalizar un informe de prueba y revisar la carpeta en Drive.

## Pendientes relacionados

- Respaldo de Postgres: revisar si el plan de Railway tiene backups; si no, `pg_dump` diario.
- Compresión de fotos en el celular antes de subir (consultar con RYSCOM si su cliente exige originales).
