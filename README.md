# Contrata — Backend

API del sistema de control de trabajos y evidencias en campo.

**Tecnologías:** NestJS 12, TypeORM, PostgreSQL, Zod, JWT. El proyecto es ESM: los imports relativos terminan en `.js`.

## Puesta en marcha

1. Instalar dependencias:

   ```bash
   npm install
   ```

2. Copiar `.env.example` como `.env` y completar `DATABASE_URL`, `JWT_SECRET` y `SEED_ADMIN_PASSWORD`.
3. Crear la base de datos vacía en PostgreSQL (por ejemplo `contrata`).
4. Aplicar las migraciones y crear el primer administrador:

   ```bash
   npm run migration:run
   ```

   ```bash
   npm run seed
   ```

5. Arrancar en desarrollo:

   ```bash
   npm run start:dev
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
│   └── core/
│       ├── usuarios/     Gestión de usuarios (solo ADMIN)
│       └── health/
└── shared/               Piezas reutilizables
    ├── entities/         Columnas base: id y fechas
    └── enums/            Roles
```

Dominios previstos: `modules/master` (clientes, sitios, catálogo de EPP), `modules/planning` (órdenes de compra e ítems), `modules/execution` (informes, evidencias, EPP, revisiones) y `services/storage` (fotos en Cloudflare R2).

### Cómo agregar un módulo

Cada módulo sigue la misma forma: `entities/`, `dto/` (esquemas Zod), `*.service.ts` (reglas de negocio), `*.controller.ts` (rutas) y `*.module.ts`.

1. Crear la carpeta en `src/modules/<dominio>/`.
2. Agregar sus entidades a `src/core/database/entities.ts`.
3. Importar el módulo en `app.module.ts`.
4. Generar y aplicar la migración.

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
| `npm run start:dev` | Servidor con recarga automática |
| `npm run build` | Compila a `dist/` |
| `npm run migration:generate -- src/core/database/migrations/Nombre --esm` | Crea una migración a partir de los cambios en las entidades |
| `npm run migration:run` | Aplica las migraciones pendientes |
| `npm run migration:revert` | Deshace la última migración |
| `npm run seed` | Crea el primer administrador |
| `npm test` | Pruebas unitarias |
| `npm run test:e2e` | Pruebas de extremo a extremo (necesitan base con migraciones y seed) |
| `npm run lint` | Revisión estática |
