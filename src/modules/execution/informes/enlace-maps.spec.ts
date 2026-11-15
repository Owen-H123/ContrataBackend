import { BadRequestException } from '@nestjs/common';
import { coordenadasDeEnlace, leerCoordenadas } from './enlace-maps.js';

describe('leerCoordenadas', () => {
  it('lee las coordenadas escritas', () => {
    expect(leerCoordenadas('-9.090194444, -78.55880556')).toEqual({
      latitud: -9.090194444,
      longitud: -78.55880556,
    });
    expect(leerCoordenadas(' -12.05;-77.04 ')).toEqual({
      latitud: -12.05,
      longitud: -77.04,
    });
  });

  it('lee el centro del mapa (@lat,lng)', () => {
    const url =
      'https://www.google.com/maps/place/Torre/@-9.0901944,-78.5588056,17z/data=!3m1';
    expect(leerCoordenadas(url)).toEqual({
      latitud: -9.0901944,
      longitud: -78.5588056,
    });
  });

  it('prefiere el pin exacto (!3d!4d) al centro del mapa', () => {
    const url =
      'https://www.google.com/maps/place/X/@-9.1,-78.6,17z/data=!3d-9.0901944!4d-78.5588056';
    expect(leerCoordenadas(url)).toEqual({
      latitud: -9.0901944,
      longitud: -78.5588056,
    });
  });

  it('lee ?q=lat,lng y el %2C codificado', () => {
    expect(leerCoordenadas('https://maps.google.com/?q=-9.09,-78.55')).toEqual({
      latitud: -9.09,
      longitud: -78.55,
    });
    expect(
      leerCoordenadas('https://www.google.com/maps?q=-9.09%2C-78.55'),
    ).toEqual({
      latitud: -9.09,
      longitud: -78.55,
    });
  });

  it('rechaza lo que no son coordenadas o están fuera de rango', () => {
    expect(leerCoordenadas('hola')).toBeNull();
    expect(leerCoordenadas('95, 10')).toBeNull();
    expect(leerCoordenadas('10, 190')).toBeNull();
  });
});

describe('coordenadasDeEnlace', () => {
  const respuesta = (location: string | null) =>
    ({ headers: { get: () => location } }) as unknown as Response;

  it('no sale a internet si el texto ya trae las coordenadas', async () => {
    const seguir = vi.fn();
    const c = await coordenadasDeEnlace('-9.09, -78.55', seguir as never);
    expect(c).toEqual({ latitud: -9.09, longitud: -78.55 });
    expect(seguir).not.toHaveBeenCalled();
  });

  it('sigue un link corto hasta el link largo', async () => {
    const seguir = vi
      .fn()
      .mockResolvedValueOnce(
        respuesta('https://www.google.com/maps/place/X/@-9.09,-78.55,17z'),
      );
    const c = await coordenadasDeEnlace(
      'https://maps.app.goo.gl/abc123',
      seguir as never,
    );
    expect(c).toEqual({ latitud: -9.09, longitud: -78.55 });
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it('no visita dominios que no son de Google', async () => {
    const seguir = vi.fn();
    await expect(
      coordenadasDeEnlace('https://malo.example.com/lugar', seguir as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      coordenadasDeEnlace('http://www.google.com/maps', seguir as never),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(seguir).not.toHaveBeenCalled();
  });

  it('no sigue una redirección hacia otro dominio', async () => {
    const seguir = vi
      .fn()
      .mockResolvedValue(respuesta('https://malo.example.com/x'));
    await expect(
      coordenadasDeEnlace('https://maps.app.goo.gl/abc', seguir as never),
    ).rejects.toThrow(/no trae coordenadas/);
    expect(seguir).toHaveBeenCalledTimes(1);
  });

  it('avisa si el link no trae coordenadas', async () => {
    await expect(
      coordenadasDeEnlace(
        'https://www.google.com/maps/place/Torre',
        vi.fn() as never,
      ),
    ).rejects.toThrow(/no trae coordenadas/);
  });
});
