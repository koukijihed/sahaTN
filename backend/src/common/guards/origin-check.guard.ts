import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthenticatedRequest } from '../types/authenticated-request';

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

@Injectable()
export class OriginCheckGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();

    if (SAFE_METHODS.has(request.method.toUpperCase())) {
      return true;
    }

    const origin = request.headers.origin;
    if (!origin) {
      return true;
    }

    const allowed = (this.configService.get<string>('corsOrigin') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean);

    if (!allowed.includes(origin)) {
      throw new ForbiddenException('Origin not allowed');
    }

    return true;
  }
}
