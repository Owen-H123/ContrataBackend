import {
  type ArgumentsHost,
  Catch,
  ConflictException,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { QueryFailedError } from 'typeorm';

interface CuerpoError {
  statusCode: number;
  error: string;
  message: string;
  detalles?: string[];
  path: string;
  timestamp: string;
}

/** Códigos de PostgreSQL que son errores del usuario, no fallas del servidor. */
const ERRORES_DE_BASE: Record<string, string> = {
  '23505': 'Ese registro ya existe',
  '23503': 'El registro está relacionado con otros datos',
};

/**
 * Da a todos los errores la misma forma, para que el frontend los trate igual.
 * Los errores inesperados se registran completos y al cliente solo le llega un mensaje genérico.
 *
 * Para enviar una lista de motivos: `throw new ConflictException({ message, detalles: [...] })`.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const error = traducirErrorDeBase(exception) ?? exception;
    const esHttp = error instanceof HttpException;
    const statusCode = esHttp
      ? error.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!esHttp) {
      this.logger.error(
        `${request.method} ${request.url}`,
        error instanceof Error ? error.stack : String(error),
      );
    }

    const { message, detalles } = esHttp
      ? leerMensaje(error)
      : {
          message: 'Ocurrió un error inesperado. Inténtalo de nuevo.',
          detalles: undefined,
        };

    const body: CuerpoError = {
      statusCode,
      error: HttpStatus[statusCode] ?? 'ERROR',
      message,
      ...(detalles ? { detalles } : {}),
      path: request.url,
      timestamp: new Date().toISOString(),
    };
    response.status(statusCode).json(body);
  }
}

/**
 * Un registro duplicado que se cuela entre la validación y el guardado
 * (dos personas a la vez) llega como error de PostgreSQL: se responde 409.
 */
function traducirErrorDeBase(exception: unknown): HttpException | null {
  if (!(exception instanceof QueryFailedError)) return null;
  const codigo = (exception.driverError as { code?: string } | undefined)?.code;
  const mensaje = codigo ? ERRORES_DE_BASE[codigo] : undefined;
  return mensaje ? new ConflictException(mensaje) : null;
}

function leerMensaje(exception: HttpException): {
  message: string;
  detalles?: string[];
} {
  const respuesta = exception.getResponse();
  if (typeof respuesta === 'string') return { message: respuesta };

  const { message, detalles } = respuesta as {
    message?: string | string[];
    detalles?: unknown;
  };
  if (Array.isArray(message)) {
    return { message: 'Los datos enviados no son válidos', detalles: message };
  }
  return {
    message: message ?? exception.message,
    detalles: Array.isArray(detalles) ? detalles.map(String) : undefined,
  };
}
