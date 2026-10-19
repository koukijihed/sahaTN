import { createHash } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../prisma/prisma.service';
import { SessionService } from './session.service';

describe('SessionService', () => {
  const ttlSeconds = 3600;
  let createMock: jest.Mock;
  let findUniqueMock: jest.Mock;
  let updateMock: jest.Mock;
  let updateManyMock: jest.Mock;
  let service: SessionService;

  beforeEach(() => {
    createMock = jest.fn();
    findUniqueMock = jest.fn();
    updateMock = jest.fn();
    updateManyMock = jest.fn();

    const prisma = {
      session: {
        create: createMock,
        findUnique: findUniqueMock,
        update: updateMock,
        updateMany: updateManyMock
      }
    } as unknown as PrismaService;

    const config = {
      get: (key: string) => (key === 'sessionTtlSeconds' ? ttlSeconds : undefined)
    } as unknown as ConfigService;

    service = new SessionService(prisma, config);
  });

  it('stores only a hash of the session token', async () => {
    createMock.mockImplementation((args: { data: { tokenHash: string } }) =>
      Promise.resolve({ id: 'session-1', tokenHash: args.data.tokenHash })
    );

    const created = await service.createSession('user-1', {});

    expect(created.token).toBeDefined();
    const storedHash = createMock.mock.calls[0][0].data.tokenHash;
    expect(storedHash).not.toBe(created.token);
    expect(storedHash).toBe(
      createHash('sha256').update(created.token).digest('hex')
    );
  });

  it('resolves an active session to a sanitized user', async () => {
    const token = 'opaque-token';
    findUniqueMock.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'patient@example.tn',
        phone: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        roles: [{ role: 'PATIENT' }]
      }
    });
    updateMock.mockResolvedValue({});

    const resolved = await service.resolveSession(token);
    expect(resolved?.user.roles).toEqual(['PATIENT']);
    expect(resolved?.user).not.toHaveProperty('passwordHash');
  });

  it('rejects an expired session', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'session-1',
      revokedAt: null,
      expiresAt: new Date(Date.now() - 1000),
      user: {
        id: 'user-1',
        email: 'patient@example.tn',
        phone: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        roles: [{ role: 'PATIENT' }]
      }
    });

    await expect(service.resolveSession('token')).resolves.toBeNull();
  });

  it('rejects a revoked session', async () => {
    findUniqueMock.mockResolvedValue({
      id: 'session-1',
      revokedAt: new Date(),
      expiresAt: new Date(Date.now() + 60_000),
      user: {
        id: 'user-1',
        email: 'patient@example.tn',
        phone: null,
        status: 'ACTIVE',
        createdAt: new Date(),
        roles: [{ role: 'PATIENT' }]
      }
    });

    await expect(service.resolveSession('token')).resolves.toBeNull();
  });
});
