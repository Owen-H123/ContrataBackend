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
