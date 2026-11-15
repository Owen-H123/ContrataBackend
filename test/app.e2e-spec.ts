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
      await api()
        .post('/api/auth/login')
        .send({ usuario: 'admin' })
        .expect(400);
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
        .send({
          nombre: 'Técnico de prueba',
          usuario,
          password,
          rol: 'TECNICO',
        })
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

  describe('órdenes de compra', () => {
    let clienteId: string;
    let sitioId: string;
    let ordenId: string;
    const numero = `45${sufijo}99`;

    // Las 12 líneas de la orden 4500154399 de Sites del Perú.
    const lineas: [number, string, string, string, number, string[]?][] = [
      [33, 'M', '4001078', 'CAMBIO CABLE VIDA C/ SUMINISTRO', 33.42],
      [1, 'UND', '4001022', 'CAMBIO TEMPLADOR GALV. C/SUMIN', 148.03],
      [2, 'UND', '4001023', 'CAMBIO GUARDACABO C/ SUMINISTRO', 16.73],
      [2, 'UND', '4001024', 'CAMBIO DE GRILLETE C/ SUMINISTRO', 33.08],
      [6, 'UND', '4001025', 'CAMBIO DE GRAPA C/ SUMINISTRO', 20.97],
      [10.21, 'M2', '4001096', 'ELIM. PINTURA Y LAVADO CON AGUA', 8.31],
      [
        10.21,
        'M2',
        '4001098',
        'PINT. METÁLICOS C/TECHNOGLOSS INTEMPERIE',
        37.17,
      ],
      [3.817, 'KG', '4001027', 'CAMBIO ELEM. GALV. GRADO 5 C/ INSUM', 24.08],
      [76.3, 'M2', '4001360', 'LIMPIEZA DE HECES DE PALOMAS', 25.54],
      [1, 'D', '4000876', 'LIMPIEZA FINAL DE OBRA', 37.77],
      [1, 'M3', '4000882', 'ELIMINACIÓN MANUAL DE MATERIAL', 34.22],
      [2, 'SER', '4001160', 'TRANSP. Y DESPLAZAMIENTO 110#450 KM', 493.41, []],
    ];

    beforeAll(async () => {
      const cliente = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({
          razonSocial: 'Cliente órdenes',
          ruc: `21${sufijo}000`.padEnd(11, '1'),
        })
        .expect(201);
      clienteId = cliente.body.id as string;
      const sitio = await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({ codigo: `PE-OC-${sufijo}`, nombre: 'DOS_ESTRELLAS', clienteId })
        .expect(201);
      sitioId = sitio.body.id as string;
    });

    it('registra la orden con sus ítems y calcula el subtotal', async () => {
      const res = await api()
        .post('/api/ordenes-compra')
        .set(auth(adminToken))
        .send({
          numero,
          clienteId,
          fechaEmision: '2026-11-02',
          items: lineas.map(
            (
              [
                cantidad,
                unidad,
                codigoMaterial,
                descripcion,
                precioUnitario,
                etapas,
              ],
              i,
            ) => ({
              ...(i === 0 ? { posicion: 10 } : {}),
              sitioId,
              cantidad,
              unidad,
              codigoMaterial,
              descripcion,
              precioUnitario,
              fechaEntrega: '2026-10-30',
              ...(etapas ? { etapas } : {}),
            }),
          ),
        })
        .expect(201);

      ordenId = res.body.id as string;
      expect(res.body).toMatchObject({
        numero,
        moneda: 'PEN',
        estado: 'ABIERTA',
      });
      expect(res.body.subtotal).toBe(5040.11);
      expect(res.body.items).toHaveLength(12);
      expect(res.body.items[0]).toMatchObject({
        posicion: 10,
        cantidad: 33,
        monto: 1102.86,
        etapas: ['ANTES', 'PROCESO', 'DESPUES'],
        sitio: { id: sitioId },
      });
      expect(res.body.items[1].posicion).toBe(20);
      expect(res.body.items[11]).toMatchObject({
        posicion: 120,
        etapas: [],
        monto: 986.82,
      });
    });

    it('no repite el número de orden para el mismo cliente', async () => {
      await api()
        .post('/api/ordenes-compra')
        .set(auth(adminToken))
        .send({
          numero,
          clienteId,
          fechaEmision: '2026-11-02',
          items: [
            {
              sitioId,
              cantidad: 1,
              unidad: 'UND',
              descripcion: 'Ítem de prueba',
              precioUnitario: 1,
            },
          ],
        })
        .expect(409);
    });

    it('rechaza sitios de otro cliente', async () => {
      const otro = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({
          razonSocial: 'Otro cliente',
          ruc: `22${sufijo}000`.padEnd(11, '2'),
        })
        .expect(201);
      const sitioAjeno = await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({
          codigo: `PE-AJ-${sufijo}`,
          nombre: 'AJENO',
          clienteId: otro.body.id,
        })
        .expect(201);
      await api()
        .post(`/api/ordenes-compra/${ordenId}/items`)
        .set(auth(adminToken))
        .send({
          sitioId: sitioAjeno.body.id,
          cantidad: 1,
          unidad: 'UND',
          descripcion: 'Ítem de prueba',
          precioUnitario: 1,
        })
        .expect(409);
    });

    it('agrega, edita y elimina ítems', async () => {
      const agregado = await api()
        .post(`/api/ordenes-compra/${ordenId}/items`)
        .set(auth(adminToken))
        .send({
          sitioId,
          cantidad: 1,
          unidad: 'und',
          descripcion: 'Ítem extra',
          precioUnitario: 10,
          etapas: ['DESPUES', 'ANTES', 'ANTES'],
        })
        .expect(201);
      const extra = agregado.body.items.at(-1);
      expect(extra).toMatchObject({
        posicion: 130,
        unidad: 'UND',
        etapas: ['ANTES', 'DESPUES'],
      });
      expect(agregado.body.subtotal).toBe(5050.11);

      const editado = await api()
        .patch(`/api/ordenes-compra/${ordenId}/items/${extra.id}`)
        .set(auth(adminToken))
        .send({ cantidad: 2 })
        .expect(200);
      expect(editado.body.subtotal).toBe(5060.11);

      await api()
        .patch(`/api/ordenes-compra/${ordenId}/items/${extra.id}`)
        .set(auth(adminToken))
        .send({ posicion: 10 })
        .expect(409);

      const final = await api()
        .delete(`/api/ordenes-compra/${ordenId}/items/${extra.id}`)
        .set(auth(adminToken))
        .expect(200);
      expect(final.body.subtotal).toBe(5040.11);
    });

    it('lista y filtra las órdenes', async () => {
      const res = await api()
        .get('/api/ordenes-compra')
        .query({ sitioId, q: numero.slice(0, 6) })
        .set(auth(adminToken))
        .expect(200);
      const fila = res.body.find((o: { id: string }) => o.id === ordenId);
      expect(fila).toMatchObject({ cantidadItems: 12, subtotal: 5040.11 });
      expect(fila).not.toHaveProperty('items');
    });

    it('una orden cerrada no permite cambiar ítems', async () => {
      await api()
        .patch(`/api/ordenes-compra/${ordenId}`)
        .set(auth(adminToken))
        .send({ estado: 'CERRADA' })
        .expect(200);
      await api()
        .post(`/api/ordenes-compra/${ordenId}/items`)
        .set(auth(adminToken))
        .send({
          sitioId,
          cantidad: 1,
          unidad: 'UND',
          descripcion: 'Ítem de prueba',
          precioUnitario: 1,
        })
        .expect(409);
    });

    it('un técnico no ve las órdenes (tienen precios)', async () => {
      const usuario = `tec_oc${sufijo}`;
      await api()
        .post('/api/usuarios')
        .set(auth(adminToken))
        .send({
          nombre: 'Técnico OC',
          usuario,
          password: 'clave-segura-123',
          rol: 'TECNICO',
        })
        .expect(201);
      const token = await login(usuario, 'clave-segura-123');
      await api().get('/api/ordenes-compra').set(auth(token)).expect(403);
    });
  });
});
