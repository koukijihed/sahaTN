import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Post,
  Req,
  Res,
  UseGuards
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import {
  ApiConflictResponse,
  ApiCookieAuth,
  ApiCreatedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse
} from '@nestjs/swagger';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { CurrentUser } from '../../common/decorators/current-user.decorator';
import { SkipCsrf } from '../../common/decorators/skip-csrf.decorator';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import {
  clearCsrfCookie,
  clearSessionCookie,
  setCsrfCookie,
  setSessionCookie
} from '../../common/cookies/cookie.util';
import {
  AuthenticatedRequest,
  AuthenticatedUser
} from '../../common/types/authenticated-request';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PublicUser } from './types/public-user';

const LOGIN_RATE_LIMIT = parseInt(
  process.env.LOGIN_THROTTLE_LIMIT ?? '20',
  10
);
const REGISTER_RATE_LIMIT = parseInt(
  process.env.REGISTER_THROTTLE_LIMIT ?? '10',
  10
);

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly configService: ConfigService
  ) {}

  @Post('register')
  @SkipCsrf()
  @HttpCode(HttpStatus.CREATED)
  @Throttle({ default: { limit: REGISTER_RATE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: 'Creer un compte patient' })
  @ApiCreatedResponse({ description: 'Compte patient cree' })
  @ApiConflictResponse({ description: 'Identifiants deja utilises' })
  register(@Body() dto: RegisterDto): Promise<PublicUser> {
    return this.authService.register(dto);
  }

  @Post('login')
  @SkipCsrf()
  @HttpCode(HttpStatus.OK)
  @Throttle({ default: { limit: LOGIN_RATE_LIMIT, ttl: 60_000 } })
  @ApiOperation({ summary: 'Se connecter et ouvrir une session' })
  @ApiOkResponse({ description: 'Session ouverte (cookies deposes)' })
  @ApiUnauthorizedResponse({ description: 'Identifiants invalides' })
  @ApiTooManyRequestsResponse({ description: 'Trop de tentatives' })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response
  ): Promise<{ user: PublicUser }> {
    const result = await this.authService.login(dto, {
      userAgent: request.headers['user-agent'],
      ipAddress: request.ip
    });

    const ttl = this.configService.get<number>('sessionTtlSeconds') ?? 604800;
    const secure = this.isSecure();
    const domain = this.cookieDomain();

    setSessionCookie(
      response,
      this.sessionCookieName(),
      result.token,
      ttl,
      secure,
      domain
    );
    setCsrfCookie(
      response,
      this.csrfCookieName(),
      randomBytes(32).toString('base64url'),
      ttl,
      secure,
      domain
    );

    return { user: result.user };
  }

  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('sahatn_session')
  @ApiOperation({ summary: 'Revoquer la session courante' })
  async logout(
    @Req() request: AuthenticatedRequest,
    @Res({ passthrough: true }) response: Response
  ): Promise<void> {
    if (request.sessionId) {
      await this.authService.logout(request.sessionId);
    }

    const secure = this.isSecure();
    const domain = this.cookieDomain();
    clearSessionCookie(response, this.sessionCookieName(), secure, domain);
    clearCsrfCookie(response, this.csrfCookieName(), secure, domain);
  }

  @Get('me')
  @UseGuards(SessionAuthGuard)
  @ApiCookieAuth('sahatn_session')
  @ApiOperation({ summary: 'Retourner l utilisateur connecte' })
  @ApiOkResponse({ description: 'Utilisateur courant' })
  @ApiUnauthorizedResponse({ description: 'Non authentifie' })
  me(
    @CurrentUser() user: AuthenticatedUser | undefined
  ): { user: AuthenticatedUser | undefined } {
    return { user };
  }

  private isSecure(): boolean {
    return this.configService.get<string>('nodeEnv') === 'production';
  }

  private cookieDomain(): string | undefined {
    return this.configService.get<string>('cookieDomain') || undefined;
  }

  private sessionCookieName(): string {
    return (
      this.configService.get<string>('sessionCookieName') ?? 'sahatn_session'
    );
  }

  private csrfCookieName(): string {
    return this.configService.get<string>('csrfCookieName') ?? 'sahatn_csrf';
  }
}
