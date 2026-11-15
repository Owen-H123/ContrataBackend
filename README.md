# Contrata — Backend

API del sistema de control de trabajos y evidencias en campo.

**Tecnologías:** NestJS 12, TypeORM, PostgreSQL, Zod, JWT. El proyecto es ESM: los imports relativos terminan en `.js`.

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   pnpm install
   ```

2. Copiar `.env.example` como `.env` y completar `DATABASE_URL`, `JWT_SECRET` y `SEED_ADMIN_PASSWORD`.
3. Crear la base de datos vacía en PostgreSQL (por ejemplo `contrata`).
4. Aplicar las migraciones y crear el primer administrador:

   ```bash
   pnpm migration:run
   ```

   ```bash
   pnpm seed
   ```

5. Arrancar en desarrollo:

   ```bash
   pnpm start:dev
   ```

La API queda en `http://localhost:3000/api`. `GET /api/health` confirma que el servidor llega a la base.

## Estructura

Organizada igual que `c4-backend-mvp`:

```
src/
├── main.ts               Arranque: seguridad, CORS, prefijo /api, validación
├── app.module.ts         Une los módulos y registra guards y filtro globales
├── core/                 Infraestructura transversal
│   ├── auth/             Inicio de sesión, perfil y tipos de la sesión
│   ├── config/           Variables de entorno validadas al arrancar
│   ├── database/         Conexión, lista de entidades, migraciones y datos iniciales
│   ├── decorators/       @Public, @Roles, @CurrentUser
│   ├── filters/          Formato único de errores
│   └── guards/           Sesión (JWT) y permisos por rol
├── modules/              Negocio, agrupado por dominio
│   ├── core/
│   │   ├── usuarios/     Gestión de usuarios (solo ADMIN)
│   │   └── health/
│   ├── master/           Datos maestros
│       ├── clientes/     Empresas que emiten las órdenes de compra
│       └── sitios/       Torres o estaciones (código PE-…, nombre, ubicación)
│   ├── planning/         Planificación
│   │   └── ordenes-compra/  Órdenes de compra y sus ítems (las actividades)
│   └── execution/        Ejecución en campo
│       ├── informes/     Informe por orden y sitio, técnicos, ubicación, envío y revisión
│       └── evidencias/   Fotos por actividad y etapa, EPP y generales; descarga y ZIP
├── services/             Integraciones externas
│   └── storage/          Fotos en Cloudflare R2 (enlaces firmados)
└── shared/               Piezas reutilizables
    ├── database/         Utilidades de consulta (escapar LIKE)
    ├── entities/         Columnas base, conversión de numeric y redondeo
    ├── enums/            Roles y etapas de evidencia (antes, proceso, después)
    └── validation/       Esquemas comunes (id)
```

Pendiente: informe en PDF, importar órdenes desde el PDF del cliente y catálogo de EPP configurable.

### Cómo agregar un módulo

Cada módulo sigue la misma forma: `entities/`, `dto/` (esquemas Zod), `*.service.ts` (reglas de negocio), `*.controller.ts` (rutas) y `*.module.ts`.

1. Crear la carpeta en `src/modules/<dominio>/`.
2. Agregar sus entidades a `src/core/database/entities.ts`.
3. Importar el módulo en `app.module.ts`.
4. Generar y aplicar la migración.

## Rutas

Todas bajo `/api`. Las de consulta piden sesión; las de escritura, el rol indicado.

| Ruta | Rol | Qué hace |
|---|---|---|
| `POST /auth/login` | Pública | Inicia sesión y devuelve el token |
| `GET /auth/me` | Sesión | Perfil del usuario actual |
| `PATCH /auth/password` | Sesión | Cambiar la propia contraseña (pide la actual) |
| `GET·POST /usuarios`, `PATCH /usuarios/:id` | ADMIN | Gestión de usuarios |
| `GET /clientes`, `GET /clientes/:id` | Sesión | Consultar clientes |
| `POST /clientes`, `PATCH /clientes/:id` | ADMIN | Crear y editar clientes (RUC único de 11 dígitos) |
| `GET /sitios?clienteId=&q=&activo=` | Sesión | Buscar sitios por cliente, código o nombre |
| `GET /sitios/:id` | Sesión | Detalle de un sitio con su cliente |
| `POST /sitios`, `PATCH /sitios/:id` | ADMIN | Crear y editar sitios (código único, en mayúsculas) |
| `GET /ordenes-compra?clienteId=&sitioId=&estado=&q=` | ADMIN, SUPERVISOR | Lista de órdenes con cantidad de ítems y subtotal |
| `GET /ordenes-compra/:id` | ADMIN, SUPERVISOR | Orden con sus ítems, el monto de cada uno y el subtotal |
| `POST /ordenes-compra` | ADMIN | Registra la orden con todos sus ítems |
| `PATCH /ordenes-compra/:id` | ADMIN | Edita la cabecera o cambia el estado (ABIERTA, CERRADA, ANULADA) |
| `POST /ordenes-compra/:id/items` | ADMIN | Agrega un ítem (solo si la orden está ABIERTA) |
| `PATCH·DELETE /ordenes-compra/:id/items/:itemId` | ADMIN | Edita o quita un ítem (solo si la orden está ABIERTA) |
| `GET /informes?estado=&ordenId=&sitioId=&tecnicoId=&q=` | Sesión | Lista de informes; un TECNICO solo ve los suyos |
| `GET /informes/:id` | Sesión | Informe con sus actividades; un TECNICO lo ve sin precios |
| `POST /informes` | ADMIN | Abre el informe de una orden en un sitio y asigna técnicos |
| `PUT /informes/:id/tecnicos` | ADMIN | Reemplaza los técnicos asignados |
| `PATCH /informes/:id/ubicacion` | ADMIN, técnico asignado | Guarda la ubicación: `{ latitud, longitud }` o `{ enlace }` con un link de Google Maps (o texto «lat, lng») |
| `POST /informes/:id/finalizar` | ADMIN, técnico asignado | Da por terminada la ejecución; 409 con la lista de faltantes si está incompleto |
| `POST /informes/:id/reabrir` | ADMIN | Vuelve a abrir la ejecución (con comentario opcional) para seguir cargando fotos o ítems |
| `POST /informes/:id/actividades` | ADMIN | Agrega un ítem en el sitio del informe; los técnicos lo ven al instante |
| `POST /informes/:id/evidencias` | ADMIN, técnico asignado | Registra una foto y devuelve el enlace para subirla a R2 |
| `POST /informes/:id/evidencias/:evidenciaId/confirmar` | Autor o ADMIN | Verifica en R2 que la foto llegó; desde ahí cuenta |
| `PATCH /informes/:id/evidencias/:evidenciaId` | Autor o ADMIN | Cambia el comentario |
| `DELETE /informes/:id/evidencias/:evidenciaId` | Autor o ADMIN | Descarta la foto (se oculta; el archivo se conserva). ADMIN puede hacerlo también con la ejecución finalizada |
| `POST /informes/:id/evidencias/:evidenciaId/restaurar` | ADMIN | Devuelve al informe una foto descartada |
| `GET /informes/:id/evidencias/:evidenciaId/descarga` | Quien ve el informe | Enlace para descargar la foto con su nombre original |
| `GET /informes/:id/fotos.zip` | Quien ve el informe | Todas las fotos en un ZIP con carpetas y números de secuencia (las descartadas no salen) |
| `GET /health` | Pública | Estado del servidor y de la base |

### Órdenes de compra

- Cada ítem es una línea de la orden: posición, sitio, código de material, descripción, cantidad, unidad, precio y fecha de entrega.
- El sitio de cada ítem debe ser del mismo cliente que la orden; así una orden puede cubrir uno o varios sitios.
- `etapas` indica qué fotos exige el ítem: por omisión `["ANTES","PROCESO","DESPUES"]`; `[]` para líneas sin fotos, como el transporte.
- Si no se indica la posición, se numera de 10 en 10 después de la mayor (10, 20, 30…).
- El monto de cada ítem y el subtotal se calculan, no se guardan; el subtotal no incluye impuestos.

### Proceso de campo

Contrata es la herramienta donde los **técnicos suben las fotos**. La aprobación la hace el cliente en su propio sistema (Sytex): aquí no se aprueba ni se rechaza. Samira (ADMIN) prepara la orden, asigna técnicos, revisa las fotos y descarga.

1. **Estado del sitio (al llegar a la estación):** 2 fotos `PANORAMICA` de la torre completa y 2 `ESTACION` de las estaciones y equipos.
2. **Ubicación:** coordenadas por GPS o con un link de Google Maps (también links cortos `maps.app.goo.gl`).
3. **EPP:** 2 fotos `EPP` (el técnico que aparece en la foto es opcional).
4. **Ejecución:** fotos de cada ítem de la orden en sus etapas `ANTES`, `DURANTE` y `FINALIZADO`. No hay tope: cuantas más fotos, mejor.
5. **Ítems nuevos:** Samira puede agregar ítems (`POST /informes/:id/actividades`) mientras la ejecución esté abierta; a los técnicos les aparecen al instante.
6. **Finalizar:** el técnico da por terminada la ejecución cuando el informe está completo. Samira puede reabrirla.
7. **Revisión interna:** Samira descarta las fotos que sobran (se ocultan, no se borran, y se pueden restaurar) y descarga el ZIP en orden.

- Un informe es **una orden en un sitio**. Estados: `EN_EJECUCION` y `FINALIZADO`; solo se cargan fotos en `EN_EJECUCION`.
- Un técnico que no está asignado recibe 404 y nunca ve precios.
- `GET /informes/:id` trae las actividades con sus fotos por etapa, `panoramicas`, `estaciones`, `epp`, `descartadas` (solo ADMIN y SUPERVISOR), el `progreso` (`completo`, `porcentaje`, `faltantes`) y el `historial`.
- El ZIP lleva números para que, ordenado por nombre, quede en secuencia: `1 Estado del sitio/…`, `2 EPP/…`, `3 Ejecución/010 <ítem>/1 Antes/001.jpg`.

### Fotos

1. `POST /informes/:id/evidencias` con `tipo` (`PANORAMICA`, `ESTACION`, `EPP`, o `ACTIVIDAD` con `itemId` y `etapa`), `nombreArchivo`, `tipoContenido` (JPG, PNG, WEBP o HEIC), `bytes` (máx. 25 MB) y opcionalmente `comentario` y `tomadaEn`.
2. El celular hace `PUT` del archivo a `subida.url` con el `Content-Type` indicado (el enlace dura 15 min).
3. `POST …/confirmar`: la API verifica que el archivo llegó. Sin confirmar, la foto no aparece ni cuenta.

Las fotos nunca se borran. Una actividad con fotos no se puede quitar de la orden ni cambiar de sitio.
Las pruebas e2e usan un almacén simulado en memoria: no necesitan credenciales.

## Fotos en Cloudflare R2

Las fotos van a un bucket privado de R2. La API no recibe los archivos: entrega enlaces firmados que duran 15 minutos (subir) o 60 minutos (ver o descargar), y el celular sube directo a R2.

1. En el panel de Cloudflare, **R2 → Create bucket**, por ejemplo `contrata-fotos`. Déjalo privado.
2. **R2 → Manage API tokens → Create API token**, con permiso **Object Read & Write** solo sobre ese bucket.
3. Copia en `.env`: el **Account ID** (`R2_ACCOUNT_ID`), el **Access Key ID** (`R2_ACCESS_KEY_ID`), el **Secret Access Key** (`R2_SECRET_ACCESS_KEY`) y el nombre del bucket (`R2_BUCKET`). El secreto se muestra una sola vez.
4. En el bucket, **Settings → CORS policy**, permite que el frontend suba y lea:

   ```json
   [
     {
       "AllowedOrigins": ["http://localhost:5173"],
       "AllowedMethods": ["GET", "PUT", "HEAD"],
       "AllowedHeaders": ["Content-Type"],
       "MaxAgeSeconds": 3600
     }
   ]
   ```

   Agrega el dominio de producción a `AllowedOrigins` cuando exista.

Sin estas variables la API arranca igual; las rutas de fotos responden 503 hasta que se configuren.

## Reglas de la base

- **Todas las rutas exigen sesión.** Las públicas se marcan con `@Public()`.
- **Permisos por rol** con `@Roles(Rol.ADMIN, ...)` en la ruta o el controlador.
- **Validación** con Zod: `@Body({ schema })`, `@Param('id', { schema })`.
- **Errores** con una sola forma: `{ statusCode, error, message, detalles?, path, timestamp }`.
- **El esquema solo cambia con migraciones**; `synchronize` está apagado.
- **La contraseña nunca sale en las respuestas**: `passwordHash` está excluido de las consultas.
- **La sesión se revalida en cada petición**: si un usuario se desactiva o cambia de rol, rige de inmediato.
- **Siempre queda un administrador activo**: no se puede desactivar ni quitar el rol al último.
- **Límite de intentos de login**: 5 fallos en 15 minutos bloquean ese usuario por 15 minutos (429).

## Comandos

| Comando | Qué hace |
|---|---|
| `pnpm start:dev` | Servidor con recarga automática |
| `pnpm build` | Compila a `dist/` |
| `pnpm migration:generate src/core/database/migrations/Nombre --esm` | Crea una migración a partir de los cambios en las entidades |
| `pnpm migration:run` | Aplica las migraciones pendientes |
| `pnpm migration:revert` | Deshace la última migración |
| `pnpm seed` | Crea el primer administrador |
| `pnpm test` | Pruebas unitarias |
| `pnpm test:e2e` | Pruebas de extremo a extremo (necesitan base con migraciones y seed) |
| `pnpm lint` | Revisión estática |
