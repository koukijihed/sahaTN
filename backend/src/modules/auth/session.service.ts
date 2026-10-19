import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash, randomBytes } from 'node:crypto';
import { PrismaService } from '../../prisma/prisma.service';
import { AuthenticatedUser } from '../../common/types/authenticated-request';
import { PublicUser } from './types/public-user';

export interface CreatedSession {
  token: string;
  sessionId: string;
  expiresAt: Date;
}

export interface ResolvedSession {
  sessionId: string;
  user: AuthenticatedUser;
}

@Injectable()
export class SessionService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService
  ) {}

  private hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }

  private ttlSeconds(): number {
    return this.configService.get<number>('sessionTtlSeconds') ?? 604800;
  }

  async createSession(
    userId: string,
    meta: { userAgent?: string; ipAddress?: string }
  ): Promise<CreatedSession> {
    const token = randomBytes(32).toString('base64url');
    const tokenHash = this.hashToken(token);
    const expiresAt = new Date(Date.now() + this.ttlSeconds() * 1000);

    const session = await this.prisma.session.create({
      data: {
        userId,
        tokenHash,
        expiresAt,
        userAgent: meta.userAgent?.slice(0, 512) ?? null,
        ipAddress: meta.ipAddress?.slice(0, 64) ?? null
      }
    });

    return { token, sessionId: session.id, expiresAt };
  }

  async resolveSession(token: string): Promise<ResolvedSession | null> {
    if (!token) {
      return null;
    }

    const tokenHash = this.hashToken(token);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: { include: { roles: true } } }
    });

    if (!session || session.revokedAt) {
      return null;
    }
    if (session.expiresAt.getTime() <= Date.now()) {
      return null;
    }
    if (session.user.status !== 'ACTIVE') {
      return null;
    }

    await this.prisma.session.update({
      where: { id: session.id },
      data: { lastUsedAt: new Date() }
    });

    const user: PublicUser = {
      id: session.user.id,
      email: session.user.email,
      phone: session.user.phone,
      status: session.user.status,
      roles: session.user.roles.map((userRole) => userRole.role),
      createdAt: session.user.createdAt
    };

    return { sessionId: session.id, user };
  }

  async revokeSession(sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }

  async revokeAllForUser(userId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { userId, revokedAt: null },
      data: { revokedAt: new Date() }
    });
  }
}
