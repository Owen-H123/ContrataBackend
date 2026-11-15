import { z } from 'zod';

/** Identificador de cualquier registro (uuid). Úsalo en `@Param('id', { schema: idSchema })`. */
export const idSchema = z.uuid('El identificador no es válido');
