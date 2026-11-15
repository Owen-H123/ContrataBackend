import { HttpException, HttpStatus } from '@nestjs/common';

/** Fallos permitidos dentro de la ventana antes de bloquear. */
export const MAX_FALLOS = 5;
/** Ventana en la que se cuentan los fallos y duración del bloqueo. */
export const VENTANA_MS = 15 * 60 * 1000;

interface Registro {
  fallos: number;
  desde: number;
  bloqueadoHasta?: number;
}

/**
 * Frena a quien intenta adivinar contraseñas: tras 5 fallos en 15 minutos
 * para el mismo nombre de usuario, ese usuario queda bloqueado 15 minutos.
 * Se cuenta por usuario (no por IP) porque en campo varios técnicos comparten red.
 *
 * Vive en memoria: alcanza para un solo servidor. Con varias instancias, mover a Redis.
 * Se registra con `useFactory` en AuthModule (el reloj es inyectable para las pruebas).
 */
export class IntentosLogin {
  private readonly registros = new Map<string, Registro>();

  constructor(private readonly ahora: () => number = Date.now) {}

  /** Lanza 429 si el usuario está bloqueado. */
  exigirPermitido(usuario: string): void {
    const registro = this.vigente(usuario);
    if (registro?.bloqueadoHasta) {
      const minutos = Math.ceil(
        (registro.bloqueadoHasta - this.ahora()) / 60_000,
      );
      throw new HttpException(
        `Demasiados intentos fallidos. Vuelve a intentar en ${minutos} min`,
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }
  }

  registrarFallo(usuario: string): void {
    const registro = this.vigente(usuario) ?? {
      fallos: 0,
      desde: this.ahora(),
    };
    registro.fallos += 1;
    if (registro.fallos >= MAX_FALLOS) {
      registro.bloqueadoHasta = this.ahora() + VENTANA_MS;
    }
    this.registros.set(usuario, registro);
  }

  registrarExito(usuario: string): void {
    this.registros.delete(usuario);
  }

  /** Devuelve el registro si sigue vigente; si venció, lo descarta. */
  private vigente(usuario: string): Registro | undefined {
    const registro = this.registros.get(usuario);
    if (!registro) return undefined;
    const vence = registro.bloqueadoHasta ?? registro.desde + VENTANA_MS;
    if (this.ahora() >= vence) {
      this.registros.delete(usuario);
      return undefined;
    }
    return registro;
  }
}
