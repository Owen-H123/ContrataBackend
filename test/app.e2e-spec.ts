import {
  type INestApplication,
  StandardSchemaValidationPipe,
} from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types.js';
import { Readable } from 'node:stream';
import { AppModule } from '../src/app.module.js';
import { StorageService } from '../src/services/storage/storage.service.js';

/**
 * R2 simulado en memoria: las pruebas no necesitan credenciales de Cloudflare.
 * `archivosR2` hace de bucket; una prueba «sube» una foto guardándola ahí.
 */
const archivosR2 = new Map<string, Buffer>();
const r2Falso = {
  configurado: true,
  urlParaSubir: async (clave: string) =>
    `https://r2.test/${clave}?firma=subida`,
  urlParaDescargar: async (clave: string, nombre?: string) =>
    `https://r2.test/${clave}?firma=descarga${nombre ? `&nombre=${encodeURIComponent(nombre)}` : ''}`,
  consultar: async (clave: string) => {
    const archivo = archivosR2.get(clave);
    return archivo
      ? { bytes: archivo.length, tipoContenido: 'image/jpeg' }
      : null;
  },
  leer: async (clave: string) => Readable.from([archivosR2.get(clave)!]),
};

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
    })
      .overrideProvider(StorageService)
      .useValue(r2Falso)
      .compile();
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
        etapas: ['ANTES', 'DURANTE', 'FINALIZADO'],
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
          etapas: ['FINALIZADO', 'ANTES', 'ANTES'],
        })
        .expect(201);
      const extra = agregado.body.items.at(-1);
      expect(extra).toMatchObject({
        posicion: 130,
        unidad: 'UND',
        etapas: ['ANTES', 'FINALIZADO'],
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
        etapas: ['ANTES', 'DURANTE', 'FINALIZADO'],
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

    it('el técnico solo ve el sitio: ni el número de la orden ni el cliente', async () => {
      const lista = await api()
        .get('/api/informes')
        .set(auth(tec1.token))
        .expect(200);
      expect(lista.body).toHaveLength(1);
      expect(lista.body[0]).not.toHaveProperty('orden');
      expect(lista.body[0].sitio).toMatchObject({ id: sitioA });

      const detalle = await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(tec1.token))
        .expect(200);
      expect(detalle.body).not.toHaveProperty('orden');
      expect(JSON.stringify(detalle.body)).not.toContain(`IN-${sufijo}`);
      expect(JSON.stringify(detalle.body)).not.toContain('Cliente informes');

      // Buscar por número de orden no encuentra nada; por sitio sí.
      const porOrden = await api()
        .get('/api/informes')
        .query({ q: `IN-${sufijo}` })
        .set(auth(tec1.token))
        .expect(200);
      expect(porOrden.body).toHaveLength(0);
      const porSitio = await api()
        .get('/api/informes')
        .query({ q: `PE-IA-${sufijo}` })
        .set(auth(tec1.token))
        .expect(200);
      expect(porSitio.body).toHaveLength(1);

      // El administrador sí ve la orden y el cliente.
      const admin = await api()
        .get(`/api/informes/${informeId}`)
        .set(auth(adminToken))
        .expect(200);
      expect(admin.body.orden).toMatchObject({
        numero: `IN-${sufijo}`,
        cliente: { razonSocial: 'Cliente informes' },
      });
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

  describe('proceso de campo: fotos, finalizar y revisión interna', () => {
    let ordenId: string;
    let itemFotos: string;
    let itemSinFotos: string;
    let informeId: string;
    let tec1: { id: string; token: string };
    let tec2: { id: string; token: string };
    let supervisorToken: string;
    const ruta = () => `/api/informes/${informeId}`;

    async function crearUsuario(nombre: string, rol: string) {
      const usuario = `${nombre}${sufijo}`;
      const res = await api()
        .post('/api/usuarios')
        .set(auth(adminToken))
        .send({ nombre, usuario, password: 'clave-segura-123', rol })
        .expect(201);
      return {
        id: res.body.id as string,
        token: await login(usuario, 'clave-segura-123'),
      };
    }

    const foto = (extra: object) => ({
      nombreArchivo: 'IMG_0001.jpg',
      tipoContenido: 'image/jpeg',
      bytes: 2_000_000,
      ...extra,
    });

    /** Pide el enlace, «sube» a R2 y confirma. Devuelve la foto confirmada. */
    async function subirFoto(token: string, datos: object) {
      const pedido = await api()
        .post(`${ruta()}/evidencias`)
        .set(auth(token))
        .send(foto(datos))
        .expect(201);
      const clave = new URL(pedido.body.subida.url as string).pathname.slice(1);
      archivosR2.set(clave, Buffer.from(`jpeg ${clave}`));
      const confirmada = await api()
        .post(`${ruta()}/evidencias/${pedido.body.evidencia.id}/confirmar`)
        .set(auth(token))
        .expect(200);
      return confirmada.body as { id: string; url: string };
    }

    /** Las 4 fotos del sitio, las 2 de EPP y las de cada etapa del ítem con fotos. */
    async function cargarTodo(token: string) {
      await subirFoto(token, { tipo: 'PANORAMICA' });
      await subirFoto(token, { tipo: 'PANORAMICA' });
      await subirFoto(token, { tipo: 'ESTACION' });
      await subirFoto(token, { tipo: 'ESTACION' });
      await subirFoto(token, { tipo: 'EPP' });
      await subirFoto(token, { tipo: 'EPP' });
      for (const etapa of ['ANTES', 'DURANTE', 'FINALIZADO']) {
        await subirFoto(token, { tipo: 'ACTIVIDAD', itemId: itemFotos, etapa });
      }
    }

    const detalle = async (token = adminToken) =>
      (await api().get(ruta()).set(auth(token)).expect(200)).body;

    beforeAll(async () => {
      const cliente = await api()
        .post('/api/clientes')
        .set(auth(adminToken))
        .send({
          razonSocial: 'Cliente evidencias',
          ruc: `24${sufijo}000`.padEnd(11, '4'),
        })
        .expect(201);
      const sitio = await api()
        .post('/api/sitios')
        .set(auth(adminToken))
        .send({
          codigo: `PE-EV-${sufijo}`,
          nombre: 'DOS_ESTRELLAS',
          clienteId: cliente.body.id,
        })
        .expect(201);
      const orden = await api()
        .post('/api/ordenes-compra')
        .set(auth(adminToken))
        .send({
          numero: `EV-${sufijo}`,
          clienteId: cliente.body.id,
          fechaEmision: '2026-11-12',
          items: [
            {
              sitioId: sitio.body.id,
              descripcion: 'CAMBIO CABLE VIDA',
              cantidad: 33,
              unidad: 'M',
              precioUnitario: 33.42,
            },
            {
              sitioId: sitio.body.id,
              descripcion: 'TRANSPORTE',
              cantidad: 2,
              unidad: 'SER',
              precioUnitario: 493.41,
              etapas: [],
            },
          ],
        })
        .expect(201);
      ordenId = orden.body.id as string;
      [itemFotos, itemSinFotos] = orden.body.items.map(
        (i: { id: string }) => i.id,
      );

      tec1 = await crearUsuario('ana', 'TECNICO');
      tec2 = await crearUsuario('luis', 'TECNICO');
      supervisorToken = (await crearUsuario('sup', 'SUPERVISOR')).token;

      const informe = await api()
        .post('/api/informes')
        .set(auth(adminToken))
        .send({
          ordenId,
          sitioId: sitio.body.id,
          tecnicoIds: [tec1.id, tec2.id],
        })
        .expect(201);
      informeId = informe.body.id as string;
    });

    it('un informe nuevo muestra todo lo que falta y no se puede finalizar', async () => {
      const informe = await detalle();
      expect(informe.estado).toBe('EN_EJECUCION');
      expect(informe.progreso.completo).toBe(false);
      expect(informe.progreso.faltantes).toEqual([
        'Falta registrar la ubicación del sitio',
        'Faltan 2 fotos panorámicas de la torre completa',
        'Faltan 2 fotos de las estaciones y equipos',
        'Faltan 2 fotos de EPP',
        'Actividad 10 (CAMBIO CABLE VIDA): falta la foto de antes',
        'Actividad 10 (CAMBIO CABLE VIDA): falta la foto de durante',
        'Actividad 10 (CAMBIO CABLE VIDA): falta la foto de finalizado',
      ]);
      expect(informe.actividades[0].evidencias).toEqual({
        ANTES: [],
        DURANTE: [],
        FINALIZADO: [],
      });
      expect(informe.actividades[1].evidencias).toEqual({});
      expect(informe.descartadas).toEqual([]);

      const res = await api()
        .post(`${ruta()}/finalizar`)
        .set(auth(tec1.token))
        .expect(409);
      expect(res.body.message).toBe('El informe está incompleto');
      expect(res.body.detalles).toHaveLength(7);
    });

    it('valida cada foto antes de dar el enlace de subida', async () => {
      const pedir = (token: string, datos: object) =>
        api().post(`${ruta()}/evidencias`).set(auth(token)).send(foto(datos));
      await pedir(tec1.token, {
        tipo: 'ACTIVIDAD',
        itemId: itemSinFotos,
        etapa: 'ANTES',
      }).expect(409);
      await pedir(tec1.token, { tipo: 'ACTIVIDAD', itemId: itemFotos }).expect(
        400,
      );
      await pedir(tec1.token, { tipo: 'GENERAL' }).expect(400);
      await pedir(tec1.token, {
        tipo: 'PANORAMICA',
        tipoContenido: 'application/pdf',
      }).expect(400);
      await pedir(tec1.token, { tipo: 'ESTACION', bytes: 30_000_000 }).expect(
        400,
      );
      const ajeno = await crearUsuario('externo', 'TECNICO');
      await pedir(adminToken, { tipo: 'EPP', tecnicoId: ajeno.id }).expect(409);
      await pedir(supervisorToken, { tipo: 'PANORAMICA' }).expect(403);
      // El técnico de la foto de EPP es opcional.
      await pedir(tec1.token, { tipo: 'EPP' }).expect(201);
    });

    it('una foto no cuenta hasta confirmar que llegó a R2', async () => {
      const pedido = await api()
        .post(`${ruta()}/evidencias`)
        .set(auth(tec1.token))
        .send(foto({ tipo: 'PANORAMICA' }))
        .expect(201);
      expect(pedido.body.subida).toMatchObject({
        metodo: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
        expiraEnSegundos: 900,
      });
      await api()
        .post(`${ruta()}/evidencias/${pedido.body.evidencia.id}/confirmar`)
        .set(auth(tec1.token))
        .expect(409);
      expect((await detalle()).panoramicas).toHaveLength(0);
    });

    it('solo el autor o un administrador comenta o quita una foto', async () => {
      const panoramica = await subirFoto(tec1.token, {
        tipo: 'PANORAMICA',
        comentario: 'Vista norte',
      });
      await api()
        .patch(`${ruta()}/evidencias/${panoramica.id}`)
        .set(auth(tec2.token))
        .send({ comentario: 'x' })
        .expect(403);
      const editada = await api()
        .patch(`${ruta()}/evidencias/${panoramica.id}`)
        .set(auth(tec1.token))
        .send({ comentario: 'Vista norte de la torre' })
        .expect(200);
      expect(editada.body.comentario).toBe('Vista norte de la torre');

      await api()
        .delete(`${ruta()}/evidencias/${panoramica.id}`)
        .set(auth(tec1.token))
        .expect(204);
      expect((await detalle()).panoramicas).toHaveLength(0);
    });

    it('con todo cargado, el informe queda completo; subir de más no estorba', async () => {
      await api()
        .patch(`${ruta()}/ubicacion`)
        .set(auth(tec1.token))
        .send({ latitud: -9.0901, longitud: -78.5588 })
        .expect(200);
      await cargarTodo(tec1.token);
      await subirFoto(tec2.token, {
        tipo: 'ACTIVIDAD',
        itemId: itemFotos,
        etapa: 'ANTES',
      });

      const informe = await detalle(tec1.token);
      expect(informe.progreso).toEqual({
        completo: true,
        porcentaje: 100,
        faltantes: [],
      });
      expect(informe.panoramicas).toHaveLength(2);
      expect(informe.estaciones).toHaveLength(2);
      expect(informe.epp.length).toBeGreaterThanOrEqual(2);
      expect(informe.actividades[0].evidencias.ANTES).toHaveLength(2);
      expect(informe.actividades[0].evidencias.ANTES[0]).toMatchObject({
        tipo: 'ACTIVIDAD',
        etapa: 'ANTES',
        subidoPor: { id: tec1.id },
        url: expect.stringContaining('https://r2.test/informes/'),
      });
      expect(informe.actividades[0].evidencias.ANTES[0]).not.toHaveProperty(
        'clave',
      );
      // El técnico no ve el apartado de descartadas.
      expect(informe).toHaveProperty('descartadas', []);
    });

    it('la ubicación se acepta como coordenadas o como link de Maps', async () => {
      const larga = await api()
        .patch(`${ruta()}/ubicacion`)
        .set(auth(tec1.token))
        .send({
          enlace:
            'https://www.google.com/maps/place/Torre/@-9.0902,-78.5589,17z',
        })
        .expect(200);
      expect(larga.body.ubicacion).toEqual({
        latitud: -9.0902,
        longitud: -78.5589,
      });

      const texto = await api()
        .patch(`${ruta()}/ubicacion`)
        .set(auth(tec1.token))
        .send({ enlace: '-9.0903, -78.559' })
        .expect(200);
      expect(texto.body.ubicacion).toEqual({
        latitud: -9.0903,
        longitud: -78.559,
      });

      await api()
        .patch(`${ruta()}/ubicacion`)
        .set(auth(tec1.token))
        .send({ enlace: 'https://malo.example.com/lugar' })
        .expect(400);
      await api()
        .patch(`${ruta()}/ubicacion`)
        .set(auth(tec1.token))
        .send({ enlace: 'hola' })
        .expect(400);
    });

    it('Samira agrega un ítem desde el informe y al técnico le aparece al instante', async () => {
      const antes = await detalle(tec2.token);
      expect(antes.actividades).toHaveLength(2);

      await api()
        .post(`${ruta()}/actividades`)
        .set(auth(tec1.token))
        .send({
          descripcion: 'X',
          cantidad: 1,
          unidad: 'UND',
          precioUnitario: 1,
        })
        .expect(403);
      const agregado = await api()
        .post(`${ruta()}/actividades`)
        .set(auth(adminToken))
        .send({
          descripcion: 'CAMBIO DE GRAPA',
          cantidad: 6,
          unidad: 'UND',
          precioUnitario: 20.97,
        })
        .expect(201);
      const nuevo = agregado.body.actividades.at(-1);
      expect(nuevo).toMatchObject({
        descripcion: 'CAMBIO DE GRAPA',
        posicion: 30,
      });

      const ve = await detalle(tec2.token);
      expect(ve.actividades).toHaveLength(3);
      expect(ve.actividades[2]).not.toHaveProperty('precioUnitario');
      // Al agregar un ítem el informe vuelve a pedir sus fotos.
      expect(ve.progreso.completo).toBe(false);
      for (const etapa of ['ANTES', 'DURANTE', 'FINALIZADO']) {
        await subirFoto(tec2.token, {
          tipo: 'ACTIVIDAD',
          itemId: nuevo.id,
          etapa,
        });
      }
      expect((await detalle()).progreso.completo).toBe(true);
    });

    it('descarga una foto con su nombre y todas en un ZIP con secuencia', async () => {
      const informe = await detalle(tec1.token);
      const fotoId = informe.panoramicas[0].id as string;
      const enlace = await api()
        .get(`${ruta()}/evidencias/${fotoId}/descarga`)
        .set(auth(supervisorToken))
        .expect(200);
      expect(enlace.body.url).toContain('nombre=IMG_0001.jpg');

      const zip = await api()
        .get(`${ruta()}/fotos.zip`)
        .set(auth(adminToken))
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      expect(zip.headers['content-type']).toBe('application/zip');
      const contenido = (zip.body as Buffer).toString('utf8');
      expect(contenido.startsWith('PK')).toBe(true);
      const nombres = [
        '1 Estado del sitio/1 Panorámicas de la torre/001.jpg',
        '1 Estado del sitio/1 Panorámicas de la torre/002.jpg',
        '1 Estado del sitio/2 Estaciones y equipos/001.jpg',
        '2 EPP/001.jpg',
        '3 Ejecución/010 CAMBIO CABLE VIDA/1 Antes/001.jpg',
        '3 Ejecución/010 CAMBIO CABLE VIDA/1 Antes/002.jpg',
        '3 Ejecución/010 CAMBIO CABLE VIDA/2 Durante/001.jpg',
        '3 Ejecución/010 CAMBIO CABLE VIDA/3 Finalizado/001.jpg',
        '3 Ejecución/030 CAMBIO DE GRAPA/1 Antes/001.jpg',
      ];
      let desde = 0;
      for (const nombre of nombres) {
        // Cada carpeta aparece en el ZIP en el orden del informe.
        const pos = contenido.indexOf(nombre, desde);
        expect(pos, nombre).toBeGreaterThanOrEqual(0);
        desde = pos;
      }
    });

    it('protege en la orden lo que ya tiene fotos', async () => {
      const quitar = (itemId: string) =>
        api()
          .delete(`/api/ordenes-compra/${ordenId}/items/${itemId}`)
          .set(auth(adminToken));
      const res = await quitar(itemFotos).expect(409);
      expect(res.body.message).toMatch(/ya tiene fotos/);
      await quitar(itemSinFotos).expect(200);
    });

    it('el técnico finaliza la ejecución y el informe queda bloqueado', async () => {
      const fin = await api()
        .post(`${ruta()}/finalizar`)
        .set(auth(tec1.token))
        .expect(200);
      expect(fin.body.estado).toBe('FINALIZADO');
      expect(fin.body.historial).toEqual([
        expect.objectContaining({
          accion: 'FINALIZADO',
          usuario: expect.objectContaining({ id: tec1.id }),
        }),
      ]);

      await api().post(`${ruta()}/finalizar`).set(auth(tec1.token)).expect(409);
      await api()
        .post(`${ruta()}/evidencias`)
        .set(auth(tec1.token))
        .send(foto({ tipo: 'PANORAMICA' }))
        .expect(409);
      await api()
        .post(`${ruta()}/actividades`)
        .set(auth(adminToken))
        .send({
          descripcion: 'Ítem de prueba',
          cantidad: 1,
          unidad: 'UND',
          precioUnitario: 1,
        })
        .expect(409);
    });

    it('Samira descarta y restaura fotos en la revisión, aun con la ejecución finalizada', async () => {
      const informe = await detalle();
      const sobrante = informe.actividades[0].evidencias.ANTES[1].id as string;

      // El técnico ya no puede quitar fotos; el supervisor tampoco descarta.
      await api()
        .delete(`${ruta()}/evidencias/${sobrante}`)
        .set(auth(tec2.token))
        .expect(409);
      await api()
        .delete(`${ruta()}/evidencias/${sobrante}`)
        .set(auth(supervisorToken))
        .expect(403);
      await api()
        .delete(`${ruta()}/evidencias/${sobrante}`)
        .set(auth(adminToken))
        .expect(204);

      const despues = await detalle();
      expect(despues.actividades[0].evidencias.ANTES).toHaveLength(1);
      const idsDescartadas = (lista: { id: string }[]) =>
        lista.map((f) => f.id);
      expect(idsDescartadas(despues.descartadas)).toContain(sobrante);
      const totalDescartadas = despues.descartadas.length;
      // El supervisor también ve lo descartado; el técnico no.
      expect((await detalle(supervisorToken)).descartadas).toHaveLength(
        totalDescartadas,
      );
      expect((await detalle(tec1.token)).descartadas).toEqual([]);
      // Lo descartado no sale en el ZIP.
      const zip = await api()
        .get(`${ruta()}/fotos.zip`)
        .set(auth(adminToken))
        .buffer(true)
        .parse((res, cb) => {
          const partes: Buffer[] = [];
          res.on('data', (parte: Buffer) => partes.push(parte));
          res.on('end', () => cb(null, Buffer.concat(partes)));
        })
        .expect(200);
      expect((zip.body as Buffer).toString('utf8')).not.toContain(
        '1 Antes/002.jpg',
      );

      await api()
        .post(`${ruta()}/evidencias/${sobrante}/restaurar`)
        .set(auth(tec1.token))
        .expect(403);
      await api()
        .post(`${ruta()}/evidencias/${sobrante}/restaurar`)
        .set(auth(adminToken))
        .expect(200);
      const restaurada = await detalle();
      expect(restaurada.actividades[0].evidencias.ANTES).toHaveLength(2);
      expect(idsDescartadas(restaurada.descartadas)).not.toContain(sobrante);
      expect(restaurada.descartadas).toHaveLength(totalDescartadas - 1);
    });

    it('Samira reabre la ejecución y el técnico sigue subiendo; no hay aprobar ni rechazar', async () => {
      await api()
        .post(`${ruta()}/reabrir`)
        .set(auth(tec1.token))
        .send({})
        .expect(403);
      await api()
        .post(`${ruta()}/reabrir`)
        .set(auth(supervisorToken))
        .send({})
        .expect(403);
      const reabierto = await api()
        .post(`${ruta()}/reabrir`)
        .set(auth(adminToken))
        .send({ comentario: 'Falta una foto del sitio' })
        .expect(200);
      expect(reabierto.body.estado).toBe('EN_EJECUCION');
      expect(
        reabierto.body.historial.map((h: { accion: string }) => h.accion),
      ).toEqual(['FINALIZADO', 'REABIERTO']);
      expect(reabierto.body.historial[1].comentario).toBe(
        'Falta una foto del sitio',
      );

      await subirFoto(tec1.token, { tipo: 'ESTACION' });
      await api()
        .post(`${ruta()}/reabrir`)
        .set(auth(adminToken))
        .send({})
        .expect(409);
      await api().post(`${ruta()}/finalizar`).set(auth(tec1.token)).expect(200);

      // Ya no existen la revisión del informe ni sus estados.
      await api()
        .post(`${ruta()}/revision`)
        .set(auth(adminToken))
        .send({ decision: 'APROBAR' })
        .expect(404);
    });

    it('cada espacio admite máximo 5 fotos; descartar una libera el cupo', async () => {
      const visibles = async () =>
        (await detalle()).estaciones as { id: string }[];
      // El test anterior dejó el informe finalizado: se reabre para seguir subiendo.
      await api()
        .post(`${ruta()}/reabrir`)
        .set(auth(adminToken))
        .send({})
        .expect(200);
      // Llena el espacio hasta el tope, sea cual sea el punto de partida.
      while ((await visibles()).length < 5) {
        await subirFoto(tec1.token, { tipo: 'ESTACION' });
      }
      expect(await visibles()).toHaveLength(5);

      const sexta = await api()
        .post(`${ruta()}/evidencias`)
        .set(auth(tec1.token))
        .send(foto({ tipo: 'ESTACION' }))
        .expect(409);
      expect(sexta.body.message).toContain('máximo');

      // Otro espacio no se ve afectado por el tope de este.
      await subirFoto(tec1.token, {
        tipo: 'ACTIVIDAD',
        itemId: itemFotos,
        etapa: 'FINALIZADO',
      });

      await api()
        .delete(`${ruta()}/evidencias/${(await visibles())[0].id}`)
        .set(auth(tec1.token))
        .expect(204);
      await subirFoto(tec1.token, { tipo: 'ESTACION' });
      expect(await visibles()).toHaveLength(5);
    });

    it('los avisos llegan a quien corresponde y cada quien ve solo los suyos', async () => {
      type Aviso = {
        id: string;
        tipo: string;
        detalle: string | null;
        informeId: string | null;
        leida: boolean;
      };
      const lista = async (token: string) =>
        (await api().get('/api/notificaciones').set(auth(token)).expect(200))
          .body as Aviso[];
      const sinLeer = async (token: string) =>
        (
          await api()
            .get('/api/notificaciones/sin-leer')
            .set(auth(token))
            .expect(200)
        ).body.total as number;

      // El técnico se entera de que le asignaron el informe y de que se reabrió.
      const deTecnico = await lista(tec1.token);
      const tipos = deTecnico.map((a) => a.tipo);
      expect(tipos).toContain('INFORME_ASIGNADO');
      expect(tipos).toContain('INFORME_REABIERTO');
      // Nunca ve la orden de compra en sus avisos.
      expect(JSON.stringify(deTecnico)).not.toContain('OC ');

      // Administradores y supervisores se enteran de lo que finalizó el técnico.
      for (const token of [adminToken, supervisorToken]) {
        const avisos = await lista(token);
        expect(
          avisos.some(
            (a) => a.tipo === 'INFORME_FINALIZADO' && a.informeId === informeId,
          ),
        ).toBe(true);
      }
      // Quien hizo la acción no se avisa a sí mismo: el administrador reabrió, no recibe el aviso de reapertura.
      expect(
        (await lista(adminToken)).some((a) => a.tipo === 'INFORME_REABIERTO'),
      ).toBe(false);

      // Leer: uno solo, solo el dueño, y todos de una vez.
      expect(await sinLeer(tec1.token)).toBeGreaterThan(0);
      const propio = deTecnico.find((a) => !a.leida)!;
      await api()
        .post(`/api/notificaciones/${propio.id}/leer`)
        .set(auth(tec2.token))
        .expect(404);
      await api()
        .post(`/api/notificaciones/${propio.id}/leer`)
        .set(auth(tec1.token))
        .expect(204);
      await api()
        .post('/api/notificaciones/leer-todas')
        .set(auth(tec1.token))
        .expect(204);
      expect(await sinLeer(tec1.token)).toBe(0);
      await api().get('/api/notificaciones').expect(401);
    });
  });
});
