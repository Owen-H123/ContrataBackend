import { BadRequestException } from '@nestjs/common';

export interface Coordenadas {
  latitud: number;
  longitud: number;
}

const NUM = String.raw`(-?\d{1,3}(?:\.\d+)?)`;

/** De más a menos exacto: el pin de la ficha, el centro del mapa, el parámetro q/ll y el texto «lat, lng». */
const PATRONES = [
  new RegExp(String.raw`!3d${NUM}!4d${NUM}`),
  new RegExp(String.raw`@${NUM},${NUM}`),
  new RegExp(
    String.raw`[?&](?:q|ll|query|center|destination)=${NUM}(?:,|%2C)\s*${NUM}`,
  ),
  new RegExp(String.raw`^\s*${NUM}\s*[,;]\s*${NUM}\s*$`),
];

const valido = (lat: number, lng: number) =>
  Number.isFinite(lat) &&
  Number.isFinite(lng) &&
  Math.abs(lat) <= 90 &&
  Math.abs(lng) <= 180;

/** Saca latitud y longitud de un link de Google Maps o de un texto «-9.0901, -78.5588». */
export function leerCoordenadas(texto: string): Coordenadas | null {
  let limpio = texto.trim();
  try {
    limpio = decodeURIComponent(limpio);
  } catch {
    // Un % suelto: se usa el texto tal cual.
  }
  for (const patron of PATRONES) {
    const m = patron.exec(limpio);
    if (!m) continue;
    const latitud = Number(m[1]);
    const longitud = Number(m[2]);
    if (valido(latitud, longitud)) return { latitud, longitud };
  }
  return null;
}

/** Solo se visitan dominios de Google: así el servidor no puede usarse para llamar a otros sitios. */
const HOST_GOOGLE =
  /^(?:maps\.app\.goo\.gl|goo\.gl|(?:www\.|maps\.)?google\.[a-z]{2,3}(?:\.[a-z]{2})?)$/;

export const esEnlaceDeGoogle = (url: URL) =>
  url.protocol === 'https:' && HOST_GOOGLE.test(url.hostname);

const ES_CORTO = (url: URL) =>
  url.hostname === 'maps.app.goo.gl' ||
  (url.hostname === 'goo.gl' && url.pathname.startsWith('/maps'));

/**
 * Convierte lo que pegó el usuario en coordenadas. Acepta links largos, links
 * cortos (maps.app.goo.gl, que se siguen hasta su destino) o las coordenadas escritas.
 */
export async function coordenadasDeEnlace(
  entrada: string,
  seguir: typeof fetch = fetch,
): Promise<Coordenadas> {
  const directas = leerCoordenadas(entrada);
  if (directas) return directas;

  let url: URL;
  try {
    url = new URL(entrada.trim());
  } catch {
    throw new BadRequestException(
      'Pega un link de Google Maps o las coordenadas (ejemplo: -9.0901, -78.5588)',
    );
  }
  if (!esEnlaceDeGoogle(url)) {
    throw new BadRequestException('Solo se aceptan links de Google Maps');
  }

  // Los links cortos redirigen al largo, que sí trae las coordenadas.
  for (let saltos = 0; saltos < 5 && ES_CORTO(url); saltos++) {
    let res: Response;
    try {
      res = await seguir(url, {
        redirect: 'manual',
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      throw new BadRequestException(
        'No se pudo abrir el link de Maps. Pega las coordenadas.',
      );
    }
    const destino = res.headers.get('location');
    if (!destino) break;
    const siguiente = new URL(destino, url);
    if (!esEnlaceDeGoogle(siguiente)) break;
    url = siguiente;
  }

  const coordenadas = leerCoordenadas(url.toString());
  if (!coordenadas) {
    throw new BadRequestException(
      'El link no trae coordenadas. Abre el lugar en Maps y copia el link, o pega las coordenadas.',
    );
  }
  return coordenadas;
}
