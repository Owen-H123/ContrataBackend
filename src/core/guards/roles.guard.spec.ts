import { type ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Rol } from '../../shared/enums/rol.enum.js';
import { RolesGuard } from './roles.guard.js';

function contextoCon(rol?: Rol): ExecutionContext {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({
      getRequest: () => ({
        usuario: rol ? { id: '1', nombre: 'Prueba', rol } : undefined,
      }),
    }),
  } as unknown as ExecutionContext;
}

function guardCon(roles: Rol[] | undefined): RolesGuard {
  const reflector = new Reflector();
  vi.spyOn(reflector, 'getAllAndOverride').mockReturnValue(roles);
  return new RolesGuard(reflector);
}

describe('RolesGuard', () => {
  it('deja pasar cuando la ruta no pide roles', () => {
    expect(guardCon(undefined).canActivate(contextoCon(Rol.TECNICO))).toBe(
      true,
    );
  });

  it('deja pasar al rol permitido', () => {
    expect(guardCon([Rol.ADMIN]).canActivate(contextoCon(Rol.ADMIN))).toBe(
      true,
    );
  });

  it('rechaza al rol no permitido', () => {
    expect(() =>
      guardCon([Rol.ADMIN]).canActivate(contextoCon(Rol.TECNICO)),
    ).toThrow(ForbiddenException);
  });

  it('rechaza cuando no hay usuario', () => {
    expect(() => guardCon([Rol.ADMIN]).canActivate(contextoCon())).toThrow(
      ForbiddenException,
    );
  });
});
