import {
  ExecutionContext,
  ForbiddenException,
  UnauthorizedException
} from '@nestjs/common';
import { Role } from '@prisma/client';
import { RolesGuard } from './roles.guard';

function contextWithUser(user?: { roles: Role[] }): ExecutionContext {
  return {
    switchToHttp: () => ({
      getRequest: () => ({ user })
    }),
    getHandler: () => ({}),
    getClass: () => ({})
  } as unknown as ExecutionContext;
}

function reflectorFor(roles?: Role[]): { getAllAndOverride: () => Role[] | undefined } {
  return { getAllAndOverride: () => roles };
}

describe('RolesGuard', () => {
  it('allows access when no roles are required', () => {
    const guard = new RolesGuard(reflectorFor(undefined) as never);
    expect(guard.canActivate(contextWithUser())).toBe(true);
  });

  it('rejects a patient trying to access a doctor-only resource', () => {
    const guard = new RolesGuard(reflectorFor([Role.DOCTOR]) as never);
    expect(() =>
      guard.canActivate(contextWithUser({ roles: [Role.PATIENT] }))
    ).toThrow(ForbiddenException);
  });

  it('allows a user holding the required role', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]) as never);
    expect(
      guard.canActivate(contextWithUser({ roles: [Role.PATIENT, Role.ADMIN] }))
    ).toBe(true);
  });

  it('throws Unauthorized when there is no authenticated user', () => {
    const guard = new RolesGuard(reflectorFor([Role.ADMIN]) as never);
    expect(() => guard.canActivate(contextWithUser(undefined))).toThrow(
      UnauthorizedException
    );
  });
});
