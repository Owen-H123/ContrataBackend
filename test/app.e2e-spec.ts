import {
  type INestApplication,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { AppModule } from '../src/app.module.js';

/**
 * Pruebas de extremo a extremo. Necesitan una base de datos con las migraciones
 * aplicadas y el administrador inicial creado (`pnpm migration:run` y `pnpm seed`).
 * Cada ejecución usa códigos aleatorios, así que se pueden repetir sobre la misma base.
 */
describe('API (e2e)', () => {
  let app: INestApplication<App>;
  let adminToken: string;
  const sufijo = Date.now().toString().slice(-6);

  const api = () => request(app.getHttpServer());
  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function login(usuario: string, password: string): Promise<string> {
    const res = await api()
      .post('/api/auth/login')
      .send({ usuario, password })
      .expect(200);
    return res.body.accessToken as string;
  }

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
    adminToken = await login(
      process.env.SEED_ADMIN_USUARIO!,
      process.env.SEED_ADMIN_PASSWORD!,
    );
  });

  afterAll(async () => {
    await app.close();
  });

  describe('acceso', () => {
    it('GET /api/health responde sin sesión', async () => {
      const res = await api().get('/api/health').expect(200);
      expect(res.body.status).toBe('ok');
    });

    it('rechaza rutas protegidas sin token', async () => {
      const res = await api().get('/api/usuarios').expect(401);
      expect(res.body).toMatchObject({
        statusCode: 401,
        path: '/api/usuarios',
      });
    });

    it('rechaza un login con datos incompletos', async () => {
      await api().post('/api/auth/login').send({ usuario: 'admin' }).expect(400);
    });

    it('rechaza credenciales incorrectas', async () => {
      await api()
        .post('/api/auth/login')
        .send({ usuario: 'admin', password: 'no-es-la-clave' })
        .expect(401);
    });

    it('el administrador lee su perfil y la lista de usuarios', async () => {
      const perfil = await api()
        .get('/api/auth/me')
        .set(auth(adminToken))
        .expect(200);
      expect(perfil.body.rol).toBe('ADMIN');

      const usuarios = await api()
        .get('/api/usuarios')
        .set(auth(adminToken))
        .expect(200);
      expect(usuarios.body[0]).not.toHaveProperty('passwordHash');
    });

    it('un técnico desactivado pierde el acceso de inmediato', async () => {
      const usuario = `tecnico${sufijo}`;
      const password = 'clave-segura-123';
      const creado = await api()
        .post('/api/usuarios')
        .set(auth(adminToken))
        .send({ nombre: 'Técnico de prueba', usuario, password, rol: 'TECNICO' })
        .expect(201);
      const token = await login(usuario, password);

      await api().get('/api/auth/me').set(auth(token)).expect(200);
      await api().get('/api/usuarios').set(auth(token)).expect(403);

      await api()
        .patch(`/api/usuarios/${creado.body.id}`)
        .set(auth(adminToken))
        .send({ activo: false })
        .expect(200);
      await api().get('/api/clientes').set(auth(token)).expect(401);
    });

    it('no deja desactivar al último administrador activo', async () => {
      const { body: usuarios } = await api()
        .get('/api/usuarios')
        .set(auth(adminToken))
        .expect(200);
      const admins = (
        usuarios as { id: string; rol: string; activo: boolean }[]
      ).filter((u) => u.rol === 'ADMIN' && u.activo);
      if (admins.length !== 1) return; // la base tiene más admins: no aplica

      await api()
        .patch(`/api/usuarios/${admins[0].id}`)
        .set(auth(adminToken))
        .send({ activo: false })
        .expect(409);
    });
  });

  describe('clientes y sitios', () => {
    const ruc = `20${sufijo}000`.padEnd(11, '7');
    let clienteId: string;
    let sitioId: string;

    it('crea un cliente', async () => {
      const res = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({ razonSocial: 'Sites del Perú (prueba)', ruc })
        .expect(201);
      expect(res.body).toMatchObject({ ruc, activo: true });
      clienteId = res.body.id as string;
    });

    it('rechaza un RUC repetido o mal formado', async () => {
      await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({ razonSocial: 'Otro', ruc })
        .expect(409);
      const res = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({ razonSocial: 'Otro', ruc: '123' })
        .expect(400);
      expect(res.body.detalles).toBeDefined();
    });

    it('crea un sitio y guarda el código en mayúsculas', async () => {
      const res = await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({
          codigo: `pe-03-an-${sufijo}-15`,
          nombre: 'DOS_ESTRELLAS',
          clienteId,
          latitud: -9.090194444,
          longitud: -78.55880556,
        })
        .expect(201);
      expect(res.body).toMatchObject({
        codigo: `PE-03-AN-${sufijo}-15`,
        latitud: -9.090194444,
        cliente: { id: clienteId },
      });
      sitioId = res.body.id as string;
    });

    it('rechaza un código de sitio repetido', async () => {
      await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({ codigo: `PE-03-AN-${sufijo}-15`, nombre: 'Otro', clienteId })
        .expect(409);
    });

    it('busca sitios por nombre y por cliente', async () => {
      const res = await api()
        .get('/api/sitios')
        .query({ q: 'estrellas', clienteId })
        .set(auth(adminToken))
        .expect(200);
      expect(res.body.map((s: { id: string }) => s.id)).toContain(sitioId);
    });

    it('rechaza filtros inválidos', async () => {
      await api()
        .get('/api/sitios')
        .query({ clienteId: 'no-es-uuid' })
        .set(auth(adminToken))
        .expect(400);
    });

    it('no crea sitios para un cliente desactivado', async () => {
      await api()
        .patch(`/api/clientes/${clienteId}`)
        .set(auth(adminToken))
        .send({ activo: false })
        .expect(200);
      await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({ codigo: `PE-99-${sufijo}`, nombre: 'Nuevo', clienteId })
        .expect(409);
    });

    it('responde 404 para un sitio que no existe', async () => {
      await api()
        .get('/api/sitios/00000000-0000-4000-8000-000000000000')
        .set(auth(adminToken))
        .expect(404);
    });
  });
});
