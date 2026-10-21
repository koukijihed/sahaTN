import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger
} from '@nestjs/common';
import { Request, Response } from 'express';

@Catch()
export class HttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(HttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    // On ne journalise et ne renvoie QUE le chemin, jamais la query string :
    // un parametre d'URL pourrait contenir une donnee sensible (jeton, filtre),
    // et le renvoyer au client (ou l'ecrire dans les logs) constitue une fuite.
    const safePath = this.safePath(request);

    const isHttpException = exception instanceof HttpException;
    const status = isHttpException
      ? exception.getStatus()
      : HttpStatus.INTERNAL_SERVER_ERROR;

    let message: string | string[] = 'Internal server error';

    if (isHttpException) {
      const exceptionResponse = exception.getResponse();
      message =
        typeof exceptionResponse === 'string'
          ? exceptionResponse
          : ((exceptionResponse as { message?: string | string[] }).message ??
            exception.message);
    } else {
      this.logger.error(
        `Unhandled exception on ${request.method} ${safePath}`,
        exception instanceof Error ? exception.stack : undefined
      );
    }

    response.status(status).json({
      statusCode: status,
      message,
      path: safePath,
      timestamp: new Date().toISOString()
    });
  }

  // Retourne uniquement le chemin (sans query string) ni fragment. Tolere une
  // valeur absente ou malformee sans jamais lever.
  private safePath(request: Request): string {
    const raw = typeof request.url === 'string' ? request.url : '';
    const queryIndex = raw.search(/[?#]/);
    const pathname = queryIndex === -1 ? raw : raw.slice(0, queryIndex);
    return pathname.length > 0 ? pathname : '/';
  }
}
