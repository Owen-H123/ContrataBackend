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

  describe('seguridad', () => {
    it('bloquea el login tras 5 intentos fallidos (429)', async () => {
      const usuario = `bloqueo${sufijo}`;
      for (let i = 0; i < 5; i++) {
        await api()
          .post('/api/auth/login')
          .send({ usuario, password: 'incorrecta' })
          .expect(401);
      }
      const res = await api()
        .post('/api/auth/login')
        .send({ usuario, password: 'incorrecta' })
        .expect(429);
      expect(res.body.message).toMatch(/Demasiados intentos/);
    });

    it('el usuario cambia su propia contraseña', async () => {
      const usuario = `clave${sufijo}`;
      await api()
        .post('/api/usuarios')
        .set(auth(adminToken))
        .send({
          nombre: 'Cambio clave',
          usuario,
          password: 'clave-vieja-1',
          rol: 'TECNICO',
        })
        .expect(201);
      const token = await login(usuario, 'clave-vieja-1');

      await api()
        .patch('/api/auth/password')
        .set(auth(token))
        .send({ actual: 'no-es', nueva: 'clave-nueva-1' })
        .expect(400);
      await api()
        .patch('/api/auth/password')
        .set(auth(token))
        .send({ actual: 'clave-vieja-1', nueva: 'clave-nueva-1' })
        .expect(204);

      await login(usuario, 'clave-nueva-1');
      await api()
        .post('/api/auth/login')
        .send({ usuario, password: 'clave-vieja-1' })
        .expect(401);
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

  describe('informes', () => {
    let ordenId: string;
    let sitioA: string;
    let sitioB: string;
    let sitioSinItems: string;
    let tec1: { id: string; token: string };
    let tec2: { id: string; token: string };
    let informeId: string;

    async function crearTecnico(nombre: string) {
      const usuario = `${nombre}${sufijo}`;
      const res = await api()
        .post('/api/usuarios')
        .set(auth(adminToken))
        .send({ nombre, usuario, password: 'clave-segura-123', rol: 'TECNICO' })
        .expect(201);
      return {
        id: res.body.id as string,
        token: await login(usuario, 'clave-segura-123'),
      };
    }

    async function crearSitio(clienteId: string, codigo: string) {
      const res = await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({ codigo, nombre: codigo, clienteId })
        .expect(201);
      return res.body.id as string;
    }

    beforeAll(async () => {
      const cliente = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({
          razonSocial: 'Cliente informes',
          ruc: `23${sufijo}000`.padEnd(11, '3'),
        })
        .expect(201);
      const clienteId = cliente.body.id as string;
      sitioA = await crearSitio(clienteId, `PE-IA-${sufijo}`);
      sitioB = await crearSitio(clienteId, `PE-IB-${sufijo}`);
      sitioSinItems = await crearSitio(clienteId, `PE-IC-${sufijo}`);

      const item = (
        sitioId: string,
        descripcion: string,
        etapas?: string[],
      ) => ({
        sitioId,
        descripcion,
        cantidad: 2,
        unidad: 'UND',
        precioUnitario: 50,
        ...(etapas ? { etapas } : {}),
      });
      const orden = await api()
        .post('/api/ordenes-compra')
        .set(auth(adminToken))
        .send({
          numero: `IN-${sufijo}`,
          clienteId,
          fechaEmision: '2026-11-10',
          items: [
            item(sitioA, 'CAMBIO DE GRILLETE'),
            item(sitioA, 'TRANSPORTE', []),
            item(sitioB, 'LIMPIEZA FINAL'),
          ],
        })
        .expect(201);
      ordenId = orden.body.id as string;

      tec1 = await crearTecnico('juan');
      tec2 = await crearTecnico('pedro');
    });

    it('el administrador abre el informe de un sitio con sus técnicos', async () => {
      const res = await api()
        .post('/api/informes')
        .set(auth(adminToken))
        .send({ ordenId, sitioId: sitioA, tecnicoIds: [tec1.id] })
        .expect(201);
      informeId = res.body.id as string;
      expect(res.body).toMatchObject({
        estado: 'EN_EJECUCION',
        orden: { id: ordenId, numero: `IN-${sufijo}` },
        sitio: { id: sitioA },
        tecnicos: [{ id: tec1.id }],
        ubicacion: null,
      });
      expect(res.body.actividades).toHaveLength(2);
      expect(res.body.actividades[0]).toMatchObject({
        descripcion: 'CAMBIO DE GRILLETE',
        etapas: ['ANTES', 'PROCESO', 'DESPUES'],
        precioUnitario: 50,
        monto: 100,
      });
      expect(res.body.actividades[1].etapas).toEqual([]);
    });

    it('rechaza informes repetidos, sitios sin actividades y usuarios que no son técnicos', async () => {
      const crear = (body: object) =>
        api().post('/api/informes').set(auth(adminToken)).send(body);
      await crear({ ordenId, sitioId: sitioA }).expect(409);
      await crear({ ordenId, sitioId: sitioSinItems }).expect(409);

      const yo = await api()
        .get('/api/auth/me')
        .set(auth(adminToken))
        .expect(200);
      await crear({
        ordenId,
        sitioId: sitioB,
        tecnicoIds: [yo.body.id],
      }).expect(409);
      await crear({ ordenId, sitioId: sitioB }).expect(201);
    });

    it('un técnico solo ve los informes que tiene asignados', async () => {
      const lista1 = await api()
        .get('/api/informes')
        .set(auth(tec1.token))
        .expect(200);
      expect(lista1.body).toHaveLength(1);
      expect(lista1.body[0]).toMatchObject({
        id: informeId,
        cantidadActividades: 2,
      });

      const lista2 = await api()
        .get('/api/informes')
        .set(auth(tec2.token))
        .expect(200);
      expect(lista2.body).toHaveLength(0);
      await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(tec2.token))
        .expect(404);
    });

    it('el técnico ve sus actividades sin precios', async () => {
      const res = await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(tec1.token))
        .expect(200);
      expect(res.body.actividades).toHaveLength(2);
      expect(res.body.actividades[0]).not.toHaveProperty('precioUnitario');
      expect(res.body.actividades[0]).not.toHaveProperty('monto');
    });

    it('el técnico asignado registra la ubicación tomada en campo', async () => {
      const res = await api()
        .patch(`/api/informes/${informeId}/ubicacion`)
        .set(auth(tec1.token))
        .send({ latitud: -9.090194444, longitud: -78.55880556 })
        .expect(200);
      expect(res.body.ubicacion).toEqual({
        latitud: -9.090194444,
        longitud: -78.55880556,
      });

      await api()
        .patch(`/api/informes/${informeId}/ubicacion`)
        .set(auth(tec2.token))
        .send({ latitud: 0, longitud: 0 })
        .expect(404);
      await api()
        .patch(`/api/informes/${informeId}/ubicacion`)
        .set(auth(tec1.token))
        .send({ latitud: 100, longitud: 0 })
        .expect(400);
    });

    it('un técnico no abre informes ni reasigna técnicos', async () => {
      await api()
        .post('/api/informes')
        .set(auth(tec1.token))
        .send({ ordenId, sitioId: sitioB })
        .expect(403);
      await api()
        .put(`/api/informes/${informeId}/tecnicos`)
        .set(auth(tec1.token))
        .send({ tecnicoIds: [tec1.id] })
        .expect(403);
    });

    it('al reasignar, el acceso cambia de técnico', async () => {
      const res = await api()
        .put(`/api/informes/${informeId}/tecnicos`)
        .set(auth(adminToken))
        .send({ tecnicoIds: [tec2.id] })
        .expect(200);
      expect(res.body.tecnicos).toEqual([
        expect.objectContaining({ id: tec2.id }),
      ]);
      await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(tec1.token))
        .expect(404);
      await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(tec2.token))
        .expect(200);
    });

    it('el administrador filtra por orden, sitio y texto', async () => {
      const porOrden = await api()
        .get('/api/informes')
        .query({ ordenId })
        .set(auth(adminToken))
        .expect(200);
      expect(porOrden.body).toHaveLength(2);

      const porTexto = await api()
        .get('/api/informes')
        .query({ q: `pe-ia-${sufijo}` })
        .set(auth(adminToken))
        .expect(200);
      expect(porTexto.body.map((i: { id: string }) => i.id)).toEqual([
        informeId,
      ]);
    });
  });
});
