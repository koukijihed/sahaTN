import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import { SKIP_CSRF_KEY } from '../decorators/skip-csrf.decorator';
import { AuthenticatedRequest } from '../types/authenticated-request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

function safeEqual(a: string, b: string): boolean {
  const bufferA = Buffer.from(a);
  const bufferB = Buffer.from(b);
  if (bufferA.length !== bufferB.length) {
    return false;
  }
  return timingSafeEqual(bufferA, bufferB);
}

@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly configService: ConfigService
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const skip = this.reflector.getAllAndOverride<boolean>(SKIP_CSRF_KEY, [
      context.getHandler(),
      context.getClass()
    ]);
    if (skip) {
      return true;
    }

    const cookieName =
      this.configService.get<string>('csrfCookieName') ?? 'sahatn_csrf';
    const cookieToken = request.cookies?.[cookieName];
    const headerToken = request.headers['x-csrf-token'];
    const header = Array.isArray(headerToken) ? headerToken[0] : headerToken;

    if (!cookieToken || !header || !safeEqual(cookieToken, header)) {
      throw new ForbiddenException('CSRF validation failed');
    }

    return true;
  }
}
