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
 * aplicadas y el administrador inicial creado (`npm run migration:run` y `npm run seed`).
 */
describe('API (e2e)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new StandardSchemaValidationPipe());
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('GET /api/health responde sin sesión', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/health')
      .expect(200);
    expect(res.body.status).toBe('ok');
  });

  it('rechaza rutas protegidas sin token', async () => {
    const res = await request(app.getHttpServer())
      .get('/api/usuarios')
      .expect(401);
    expect(res.body).toMatchObject({ statusCode: 401, path: '/api/usuarios' });
  });

  it('rechaza un login con datos incompletos', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: 'admin' })
      .expect(400);
  });

  it('rechaza credenciales incorrectas', async () => {
    await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({ usuario: 'admin', password: 'no-es-la-clave' })
      .expect(401);
  });

  it('inicia sesión y lee rutas según el rol', async () => {
    const login = await request(app.getHttpServer())
      .post('/api/auth/login')
      .send({
        usuario: process.env.SEED_ADMIN_USUARIO,
        password: process.env.SEED_ADMIN_PASSWORD,
      })
      .expect(200);
    const token = login.body.accessToken as string;

    const perfil = await request(app.getHttpServer())
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(perfil.body.rol).toBe('ADMIN');

    const usuarios = await request(app.getHttpServer())
      .get('/api/usuarios')
      .set('Authorization', `Bearer ${token}`)
      .expect(200);
    expect(usuarios.body[0]).not.toHaveProperty('passwordHash');
  });
});
