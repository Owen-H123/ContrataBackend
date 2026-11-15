import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { Env } from '../../core/config/env.schema.js';
import { StorageService } from './storage.service.js';

function servicioCon(valores: Partial<Env>): StorageService {
  const config = {
    get: (clave: keyof Env) => valores[clave],
  } as unknown as ConfigService<Env, true>;
  return new StorageService(config);
}

const R2 = {
  R2_ACCOUNT_ID: 'cuenta123',
  R2_ACCESS_KEY_ID: 'clave-de-prueba',
  R2_SECRET_ACCESS_KEY: 'secreto-de-prueba',
  R2_BUCKET: 'contrata-fotos',
};

describe('StorageService', () => {
  it('sin variables R2 no está configurado y rechaza firmar', async () => {
    const storage = servicioCon({});
    expect(storage.configurado).toBe(false);
    await expect(
      storage.urlParaSubir('a.jpg', 'image/jpeg'),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });

  it('firma una subida al bucket de R2 sin conectarse', async () => {
    const storage = servicioCon(R2);
    expect(storage.configurado).toBe(true);

    const url = new URL(
      await storage.urlParaSubir('informes/abc/foto.jpg', 'image/jpeg'),
    );
    expect(url.hostname).toBe(
      'contrata-fotos.cuenta123.r2.cloudflarestorage.com',
    );
    expect(url.pathname).toBe('/informes/abc/foto.jpg');
    expect(url.searchParams.get('X-Amz-Expires')).toBe('900');
    expect(url.searchParams.get('X-Amz-Signature')).toBeTruthy();
  });

  it('firma una descarga con nombre de archivo', async () => {
    const url = new URL(
      await servicioCon(R2).urlParaDescargar('x/foto.jpg', 'antes "1".jpg'),
    );
    expect(url.searchParams.get('response-content-disposition')).toBe(
      'attachment; filename="antes 1.jpg"',
    );
    expect(url.searchParams.get('X-Amz-Expires')).toBe('3600');
  });
});

describe('StorageService (local)', () => {
  const LOCAL = {
    STORAGE_LOCAL_DIR: '/tmp/contrata-fotos',
    PUBLIC_API_URL: 'http://localhost:3000/api',
    JWT_SECRET: 'secreto-de-prueba-local-de-32-caracteres-min',
    PORT: 3000,
  };

  it('usa el disco cuando no hay R2 y firma enlaces hacia la propia API', async () => {
    const storage = servicioCon(LOCAL);
    expect(storage.motor).toBe('local');
    const url = new URL(
      await storage.urlParaSubir('informes/a/f.jpg', 'image/jpeg'),
    );
    expect(url.origin + url.pathname).toBe(
      'http://localhost:3000/api/archivos/informes/a/f.jpg',
    );
    expect(url.searchParams.get('tipo')).toBe('image/jpeg');
    expect(url.searchParams.get('firma')).toBeTruthy();
  });

  it('R2 tiene prioridad sobre el disco', () => {
    expect(servicioCon({ ...LOCAL, ...R2 }).motor).toBe('r2');
  });

  it('acepta su propia firma y rechaza una alterada o vencida', async () => {
    const storage = servicioCon(LOCAL);
    const local = storage.local!;
    const params = (u: string) => Object.fromEntries(new URL(u).searchParams);

    const buena = params(await storage.urlParaDescargar('x/y.jpg', 'foto.jpg'));
    expect(() => local.verificar('x/y.jpg', 'GET', buena)).not.toThrow();
    expect(() => local.verificar('x/otro.jpg', 'GET', buena)).toThrow(
      /no es válido/,
    );
    expect(() => local.verificar('x/y.jpg', 'PUT', buena)).toThrow(
      /no es válido/,
    );
    expect(() =>
      local.verificar('x/y.jpg', 'GET', { ...buena, nombre: 'otro.jpg' }),
    ).toThrow(/no es válido/);

    const vencida = { ...buena, vence: '1' };
    expect(() => local.verificar('x/y.jpg', 'GET', vencida)).toThrow(
      /no es válido/,
    );
  });

  it('no deja salir de la carpeta', () => {
    const local = servicioCon(LOCAL).local!;
    expect(local.ruta('informes/a/f.jpg')).toBe(
      '/tmp/contrata-fotos/informes/a/f.jpg',
    );
    expect(() => local.ruta('../../etc/passwd')).toThrow();
  });
});
