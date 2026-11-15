import {
  type ArgumentsHost,
  Catch,
  type ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';

interface CuerpoError {
  statusCode: number;
  error: string;
  message: string;
  detalles?: string[];
  path: string;
  timestamp: string;
}

/**
 * Da a todos los errores la misma forma, para que el frontend los trate igual.
 * Los errores inesperados se registran completos y al cliente solo le llega un mensaje genérico.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const http = host.switchToHttp();
    const request = http.getRequest<Request>();
    const response = http.getResponse<Response>();

    const esHttp = exception instanceof HttpException;
    const statusCode = esHttp
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    if (!esHttp) {
      this.logger.error(
        `${request.method} ${request.url}`,
        exception instanceof Error ? exception.stack : String(exception),
      );
    }

    const { message, detalles } = esHttp
      ? leerMensaje(exception)
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

function leerMensaje(exception: HttpException): {
  message: string;
  detalles?: string[];
} {
  const respuesta = exception.getResponse();
  if (typeof respuesta === 'string') return { message: respuesta };

  const { message } = respuesta as { message?: string | string[] };
  if (Array.isArray(message)) {
    return { message: 'Los datos enviados no son válidos', detalles: message };
  }
  return { message: message ?? exception.message };
}
