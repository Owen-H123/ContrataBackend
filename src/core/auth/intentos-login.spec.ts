import { HttpException } from '@nestjs/common';
import { IntentosLogin, MAX_FALLOS, VENTANA_MS } from './intentos-login.js';

describe('IntentosLogin', () => {
  let reloj: number;
  let intentos: IntentosLogin;

  beforeEach(() => {
    reloj = 1_000_000;
    intentos = new IntentosLogin(() => reloj);
  });

  const fallar = (veces: number, usuario = 'juan') => {
    for (let i = 0; i < veces; i++) intentos.registrarFallo(usuario);
  };

  it('permite hasta 4 fallos', () => {
    fallar(MAX_FALLOS - 1);
    expect(() => intentos.exigirPermitido('juan')).not.toThrow();
  });

  it('bloquea al quinto fallo con 429', () => {
    fallar(MAX_FALLOS);
    try {
      intentos.exigirPermitido('juan');
      expect.unreachable();
    } catch (error) {
      expect(error).toBeInstanceOf(HttpException);
      expect((error as HttpException).getStatus()).toBe(429);
    }
  });

  it('el bloqueo es por usuario', () => {
    fallar(MAX_FALLOS);
    expect(() => intentos.exigirPermitido('pedro')).not.toThrow();
  });

  it('el bloqueo vence a los 15 minutos', () => {
    fallar(MAX_FALLOS);
    reloj += VENTANA_MS;
    expect(() => intentos.exigirPermitido('juan')).not.toThrow();
  });

  it('los fallos viejos dejan de contar', () => {
    fallar(MAX_FALLOS - 1);
    reloj += VENTANA_MS;
    fallar(1);
    expect(() => intentos.exigirPermitido('juan')).not.toThrow();
  });

  it('un acceso correcto reinicia la cuenta', () => {
    fallar(MAX_FALLOS - 1);
    intentos.registrarExito('juan');
    fallar(MAX_FALLOS - 1);
    expect(() => intentos.exigirPermitido('juan')).not.toThrow();
  });
});
