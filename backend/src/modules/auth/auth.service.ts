import {
  ConflictException,
  HttpException,
  HttpStatus,
  Injectable,
  UnauthorizedException
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, Role } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';
import { PublicUser } from './types/public-user';

export interface LoginResult {
  token: string;
  expiresAt: Date;
  user: PublicUser;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly passwordService: PasswordService,
    private readonly sessionService: SessionService,
    private readonly configService: ConfigService
  ) {}

  async register(dto: RegisterDto): Promise<PublicUser> {
    const passwordHash = await this.passwordService.hash(dto.password);

    try {
      const user = await this.prisma.user.create({
        data: {
          email: dto.email,
          phone: dto.phone ?? null,
          passwordHash,
          roles: { create: [{ role: Role.PATIENT }] }
        },
        include: { roles: true }
      });

      return this.toPublicUser(user);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new ConflictException(
          'An account with these identifiers already exists'
        );
      }
      throw error;
    }
  }

  async login(
    dto: LoginDto,
    meta: { userAgent?: string; ipAddress?: string }
  ): Promise<LoginResult> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email },
      include: { roles: true }
    });

    if (!user || !user.passwordHash) {
      await this.passwordService.verifyDummy(dto.password);
      throw new UnauthorizedException('Invalid credentials');
    }

    if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
      throw new HttpException(
        'Too many login attempts. Please try again later.',
        HttpStatus.TOO_MANY_REQUESTS
      );
    }

    if (user.status !== 'ACTIVE') {
      throw new UnauthorizedException('Invalid credentials');
    }

    const isValid = await this.passwordService.verify(
      user.passwordHash,
      dto.password
    );

    if (!isValid) {
      await this.registerFailedAttempt(user.id, user.failedLoginAttempts);
      throw new UnauthorizedException('Invalid credentials');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        failedLoginAttempts: 0,
        lockedUntil: null,
        lastLoginAt: new Date()
      }
    });

    const session = await this.sessionService.createSession(user.id, meta);

    return {
      token: session.token,
      expiresAt: session.expiresAt,
      user: this.toPublicUser(user)
    };
  }

  async logout(sessionId: string): Promise<void> {
    await this.sessionService.revokeSession(sessionId);
  }

  // Attribution controlee d'un role (utilisee par la verification : jamais
  // auto-attribuable par le client). Les appels passent par ce service afin de
  // centraliser l'ecriture dans la table UserRole.
  async assignRole(
    userId: string,
    role: Role,
    client: Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    await client.userRole.upsert({
      where: { userId_role: { userId, role } },
      update: {},
      create: { userId, role }
    });
  }

  async removeRole(
    userId: string,
    role: Role,
    client: Prisma.TransactionClient = this.prisma
  ): Promise<void> {
    await client.userRole.deleteMany({ where: { userId, role } });
  }

  private async registerFailedAttempt(
    userId: string,
    currentAttempts: number
  ): Promise<void> {
    const maxAttempts =
      this.configService.get<number>('loginMaxAttempts') ?? 5;
    const lockMinutes =
      this.configService.get<number>('loginLockMinutes') ?? 15;

    const attempts = currentAttempts + 1;
    const data: Prisma.UserUpdateInput = {
      failedLoginAttempts: attempts
    };

    if (attempts >= maxAttempts) {
      data.failedLoginAttempts = 0;
      data.lockedUntil = new Date(Date.now() + lockMinutes * 60_000);
    }

    await this.prisma.user.update({ where: { id: userId }, data });
  }

  private toPublicUser(user: {
    id: string;
    email: string | null;
    phone: string | null;
    status: string;
    createdAt: Date;
    roles: { role: Role }[];
  }): PublicUser {
    return {
      id: user.id,
      email: user.email,
      phone: user.phone,
      status: user.status,
      roles: user.roles.map((userRole) => userRole.role),
      createdAt: user.createdAt
    };
  }
}
