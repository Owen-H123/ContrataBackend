import { envSchema } from './env.schema.js';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/contrata',
  JWT_SECRET: 'x'.repeat(32),
};

describe('envSchema', () => {
  it('arranca sin R2 (sin fotos)', () => {
    expect(envSchema.safeParse(base).success).toBe(true);
  });

  it('acepta las cuatro variables de R2', () => {
    const r = envSchema.safeParse({
      ...base,
      R2_ACCOUNT_ID: 'a',
      R2_ACCESS_KEY_ID: 'b',
      R2_SECRET_ACCESS_KEY: 'c',
      R2_BUCKET: 'd',
    });
    expect(r.success).toBe(true);
  });

  it('trata las variables vacías como no definidas', () => {
    const r = envSchema.safeParse({ ...base, R2_BUCKET: '' });
    expect(r.success).toBe(true);
  });

  it('rechaza R2 a medias e indica cuáles faltan', () => {
    const r = envSchema.safeParse({ ...base, R2_BUCKET: 'fotos' });
    expect(r.success).toBe(false);
    expect(r.error?.issues.map((i) => i.path[0]).sort()).toEqual([
      'R2_ACCESS_KEY_ID',
      'R2_ACCOUNT_ID',
      'R2_SECRET_ACCESS_KEY',
    ]);
  });
});
