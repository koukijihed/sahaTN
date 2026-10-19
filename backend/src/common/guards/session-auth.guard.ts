import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SessionService } from '../../modules/auth/session.service';
import { AuthenticatedRequest } from '../types/authenticated-request';

@Injectable()
export class SessionAuthGuard implements CanActivate {
  constructor(
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const cookieName =
      this.configService.get<string>('sessionCookieName') ?? 'sahatn_session';
    const token = request.cookies?.[cookieName];

    if (!token || typeof token !== 'string') {
      throw new UnauthorizedException('Authentication required');
    }

    const resolved = await this.sessionService.resolveSession(token);
    if (!resolved) {
      throw new UnauthorizedException('Authentication required');
    }

    request.user = resolved.user;
    request.sessionId = resolved.sessionId;
    return true;
  }
}
