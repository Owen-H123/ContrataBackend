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
│   └── planning/         Planificación
│       └── ordenes-compra/  Órdenes de compra y sus ítems (las actividades)
└── shared/               Piezas reutilizables
    ├── database/         Utilidades de consulta (escapar LIKE)
    ├── entities/         Columnas base, conversión de numeric y redondeo
    ├── enums/            Roles y etapas de evidencia (antes, proceso, después)
    └── validation/       Esquemas comunes (id)
```

Dominios previstos: `modules/master` (catálogo de EPP), `modules/execution` (informes, evidencias, EPP, revisiones) y `services/storage` (fotos en Cloudflare R2).

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
| `GET /health` | Pública | Estado del servidor y de la base |

### Órdenes de compra

- Cada ítem es una línea de la orden: posición, sitio, código de material, descripción, cantidad, unidad, precio y fecha de entrega.
- El sitio de cada ítem debe ser del mismo cliente que la orden; así una orden puede cubrir uno o varios sitios.
- `etapas` indica qué fotos exige el ítem: por omisión `["ANTES","PROCESO","DESPUES"]`; `[]` para líneas sin fotos, como el transporte.
- Si no se indica la posición, se numera de 10 en 10 después de la mayor (10, 20, 30…).
- El monto de cada ítem y el subtotal se calculan, no se guardan; el subtotal no incluye impuestos.

## Reglas de la base

- **Todas las rutas exigen sesión.** Las públicas se marcan con `@Public()`.
- **Permisos por rol** con `@Roles(Rol.ADMIN, ...)` en la ruta o el controlador.
- **Validación** con Zod: `@Body({ schema })`, `@Param('id', { schema })`.
- **Errores** con una sola forma: `{ statusCode, error, message, detalles?, path, timestamp }`.
- **El esquema solo cambia con migraciones**; `synchronize` está apagado.
- **La contraseña nunca sale en las respuestas**: `passwordHash` está excluido de las consultas.
- **La sesión se revalida en cada petición**: si un usuario se desactiva o cambia de rol, rige de inmediato.
- **Siempre queda un administrador activo**: no se puede desactivar ni quitar el rol al último.

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
