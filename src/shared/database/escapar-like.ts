/** Evita que %, _ o \ escritos por el usuario actúen como comodines en un LIKE/ILIKE. */
export function escaparLike(texto: string): string {
  return texto.replace(/[\\%_]/g, '\\$&');
}
