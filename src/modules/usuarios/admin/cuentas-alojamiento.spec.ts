import { describe, it } from 'node:test';
import { strict as assert } from 'node:assert';
import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import * as bcrypt from 'bcryptjs';
import { EstadoUsuario, RolUsuario, Usuario } from '../entities/usuario.entity';
import { AislamientoAlojamientoGuard } from '../seguridad/aislamiento-alojamiento.guard';
import { AuthService } from '../seguridad/auth.service';
import { CLAVE_ROLES } from '../seguridad/roles.decorator';
import { RolesGuard } from '../seguridad/roles.guard';
import { SesionJwt } from '../seguridad/seguridad.tipos';
import { REGLA_CONTRASENA } from '../dto/auth/auth.dto';
import { CatalogoDeCuentas, CuentasAlojamientoService, generarClaveTemporal } from './cuentas-alojamiento.service';

// Bloque R: jerarquía de cuentas (R4, R5), guardas de rol y aislamiento por alojamiento (R3).

const SUPER = '11111111-1111-4111-8111-111111111111';
const ADMIN_A = '22222222-2222-4222-8222-222222222222';
const RECEP_A = '33333333-3333-4333-8333-333333333333';
const sesion = (rol: RolUsuario, alojamientoId: number | null, id = ADMIN_A): SesionJwt => ({ id, rol, estado: EstadoUsuario.ACTIVO, alojamientoId });

const estadoHttp = async (f: () => Promise<unknown> | unknown): Promise<number | string> => {
  try {
    await f();
    return 'OK';
  } catch (e) {
    return e instanceof HttpException ? e.getStatus() : `otro: ${e}`;
  }
};

// Repositorio y conexión de mentira: guardan en memoria y registran la auditoría
function entorno(opciones: { catalogo?: boolean; fallaCuenta?: boolean } = {}) {
  const usuarios: Usuario[] = [];
  const auditoria: unknown[] = [];
  const catalogoLlamadas: string[] = [];
  const repo = {
    create: (datos: Partial<Usuario>) => ({ ...datos }) as Usuario,
    existsBy: async ({ email }: { email: string }) => usuarios.some((u) => u.email === email),
  };
  const manager = {
    save: async (u: Usuario) => {
      if (opciones.fallaCuenta) throw new Error('falla simulada al guardar la cuenta');
      const guardado = { ...u, id: u.id ?? `${usuarios.length + 1}0000000-0000-4000-8000-000000000000`, createdAt: new Date() };
      usuarios.push(guardado);
      return guardado;
    },
  };
  const dataSource = { transaction: async (f: (m: typeof manager) => Promise<unknown>) => f(manager) };
  const auditoriaService = { registrar: async (_m: unknown, r: unknown) => void auditoria.push(r) };
  const auth = new AuthService(undefined, undefined as never);
  const catalogo: CatalogoDeCuentas | undefined = opciones.catalogo
    ? {
        crear: async (dto, actor) => (catalogoLlamadas.push(`crear:${actor.rol}`), { id: 42, nombre: dto.nombre, propietarioId: actor.id }) as never,
        asignarPropietario: async (id, propietarioId) => (catalogoLlamadas.push(`propietario:${id}:${propietarioId}`), { id, propietarioId }) as never,
        eliminarRecienCreado: async (id) => void catalogoLlamadas.push(`eliminar:${id}`),
      }
    : undefined;
  const servicio = new CuentasAlojamientoService(repo as never, dataSource as never, auditoriaService as never, auth, catalogo);
  return { servicio, usuarios, auditoria, catalogoLlamadas };
}

const alojamiento = { nombre: 'QA-Hotel Norte', ciudadId: 1, precioPorNoche: 80, capacidadAdultos: 2, capacidadNinos: 1, tienePiscina: false } as never;
const cuenta = (email: string) => ({ email, nombre: 'QA-Nombre', apellido: 'QA-Apellido' });

describe('Bloque R: cuentas por alojamiento (R4 y R5)', () => {
  it('a) SUPERADMIN crea el alojamiento y su primer ADMIN_ALOJAMIENTO vinculado y propietario', async () => {
    const e = entorno({ catalogo: true });
    const r = await e.servicio.crearAlojamientoConAdministrador({ alojamiento, administrador: cuenta('Admin.Norte@QA.test') }, sesion(RolUsuario.SUPERADMIN, null, SUPER));
    assert.equal(r.alojamiento.id, 42);
    assert.equal(r.administrador.rol, RolUsuario.ADMINISTRADOR);
    assert.equal(r.administrador.alojamientoId, 42);
    assert.equal(r.administrador.email, 'admin.norte@qa.test');
    assert.equal(r.administrador.estado, EstadoUsuario.ACTIVO);
    assert.equal(r.administrador.requiereCambioClave, true);
    assert.match(r.administrador.claveTemporal, REGLA_CONTRASENA);
    assert.ok(await bcrypt.compare(r.administrador.claveTemporal, e.usuarios[0].passwordHash));
    assert.deepEqual(e.catalogoLlamadas, ['crear:superadmin', `propietario:42:${r.administrador.id}`]);
    assert.equal(e.auditoria.length, 1);
  });

  it('a) si la cuenta no se puede guardar, el alojamiento recién creado se elimina (flujo atómico)', async () => {
    const e = entorno({ catalogo: true, fallaCuenta: true });
    await assert.rejects(() => e.servicio.crearAlojamientoConAdministrador({ alojamiento, administrador: cuenta('x@qa.test') }, sesion(RolUsuario.SUPERADMIN, null, SUPER)));
    assert.deepEqual(e.catalogoLlamadas, ['crear:superadmin', 'eliminar:42']);
    assert.equal(e.usuarios.length, 0);
  });

  it('a) solo el SUPERADMIN crea alojamientos: un administrador o una recepción reciben 403', async () => {
    const e = entorno({ catalogo: true });
    const dto = { alojamiento, administrador: cuenta('y@qa.test') };
    assert.equal(await estadoHttp(() => e.servicio.crearAlojamientoConAdministrador(dto, sesion(RolUsuario.ADMINISTRADOR, 1))), 403);
    assert.equal(await estadoHttp(() => e.servicio.crearAlojamientoConAdministrador(dto, sesion(RolUsuario.RECEPCION, 1, RECEP_A))), 403);
    assert.equal(e.catalogoLlamadas.length, 0);
  });

  it('b) ADMIN_ALOJAMIENTO crea recepcionistas solo para SU alojamiento (el del JWT, no el del cuerpo)', async () => {
    const e = entorno();
    const r = await e.servicio.crearRecepcionista({ ...cuenta('recep@qa.test'), alojamientoId: 99 } as never, sesion(RolUsuario.ADMINISTRADOR, 7));
    assert.equal(r.rol, RolUsuario.RECEPCION);
    assert.equal(r.alojamientoId, 7, 'el alojamiento es el del token, no el 99 del cuerpo');
    assert.equal(r.requiereCambioClave, true);
    assert.ok(r.claveTemporal);
    // Con contraseña propia no hay clave temporal ni cambio forzado
    const conClave = await e.servicio.crearRecepcionista({ ...cuenta('recep2@qa.test'), password: 'clave-propia-123' }, sesion(RolUsuario.ADMINISTRADOR, 7));
    assert.equal(conClave.requiereCambioClave, false);
    assert.equal(conClave.claveTemporal, undefined);
  });

  it('b) un administrador sin alojamiento en el token no crea recepcionistas (403); correo repetido da 409', async () => {
    const e = entorno();
    assert.equal(await estadoHttp(() => e.servicio.crearRecepcionista(cuenta('r@qa.test'), sesion(RolUsuario.ADMINISTRADOR, null))), 403);
    await e.servicio.crearRecepcionista(cuenta('r@qa.test'), sesion(RolUsuario.ADMINISTRADOR, 7));
    assert.equal(await estadoHttp(() => e.servicio.crearRecepcionista(cuenta('R@qa.test'), sesion(RolUsuario.ADMINISTRADOR, 7))), 409);
  });

  it('c) RECEPCION no crea usuarios (ni recepcionistas ni administradores): 403', async () => {
    const e = entorno({ catalogo: true });
    assert.equal(await estadoHttp(() => e.servicio.crearRecepcionista(cuenta('z@qa.test'), sesion(RolUsuario.RECEPCION, 7, RECEP_A))), 403);
    assert.equal(e.usuarios.length, 0);
  });

  it('la clave temporal cumple la regla de contraseñas', () => {
    for (let i = 0; i < 50; i++) {
      const clave = generarClaveTemporal();
      assert.match(clave, REGLA_CONTRASENA);
      assert.ok(clave.length >= 8 && clave.length <= 72);
    }
  });
});

// Contexto de ejecución de mentira para probar las guardas sin levantar Nest
function contexto(usuario: SesionJwt | undefined, roles: RolUsuario[] | undefined, peticion: Record<string, unknown> = {}) {
  const req = { usuario, params: {}, query: {}, body: {}, ...peticion };
  const handler = () => undefined;
  const clase = class {};
  const reflector = new Reflector();
  Reflect.defineMetadata(CLAVE_ROLES, roles, handler);
  const ctx = { getHandler: () => handler, getClass: () => clase, switchToHttp: () => ({ getRequest: () => req }) } as never;
  return { ctx, reflector };
}

describe('Bloque R: guardas de rol y aislamiento (R3)', () => {
  const rolesDePrecios = [RolUsuario.ADMINISTRADOR, RolUsuario.SUPERADMIN]; // planes, restricciones y disponibilidad
  const rolesDeCuentas = [RolUsuario.SUPERADMIN]; // /admin/usuarios

  it('c) RECEPCION no entra a precios/tarifas ni a la gestión de usuarios (403); administrador y superadmin sí a precios', async () => {
    for (const roles of [rolesDePrecios, rolesDeCuentas]) {
      const { ctx, reflector } = contexto(sesion(RolUsuario.RECEPCION, 7, RECEP_A), roles);
      assert.equal(await estadoHttp(() => new RolesGuard(reflector).canActivate(ctx)), 403);
    }
    for (const rol of [RolUsuario.ADMINISTRADOR, RolUsuario.SUPERADMIN]) {
      const { ctx, reflector } = contexto(sesion(rol, rol === RolUsuario.SUPERADMIN ? null : 7), rolesDePrecios);
      assert.equal(new RolesGuard(reflector).canActivate(ctx), true);
    }
    const { ctx, reflector } = contexto(sesion(RolUsuario.ADMINISTRADOR, 7), rolesDeCuentas);
    assert.equal(await estadoHttp(() => new RolesGuard(reflector).canActivate(ctx)), 403);
  });

  it('d) un usuario del alojamiento A no accede al alojamiento B por ruta, query ni cuerpo (404, sin revelar que existe)', async () => {
    const guard = new AislamientoAlojamientoGuard();
    for (const rol of [RolUsuario.ADMINISTRADOR, RolUsuario.RECEPCION]) {
      const yo = sesion(rol, 1, rol === RolUsuario.RECEPCION ? RECEP_A : ADMIN_A);
      assert.equal(await estadoHttp(() => guard.canActivate(contexto(yo, undefined, { params: { alojamientoId: '2' } }).ctx)), 404);
      assert.equal(await estadoHttp(() => guard.canActivate(contexto(yo, undefined, { query: { alojamientoId: '2' } }).ctx)), 404);
      assert.equal(await estadoHttp(() => guard.canActivate(contexto(yo, undefined, { body: { alojamientoId: 2 } }).ctx)), 404);
      assert.equal(guard.canActivate(contexto(yo, undefined, { params: { alojamientoId: '1' }, body: { alojamientoId: 1 } }).ctx), true);
      assert.equal(guard.canActivate(contexto(yo, undefined).ctx), true);
    }
    // El superadmin no tiene restricción; una recepción sin alojamiento no opera nada
    assert.equal(guard.canActivate(contexto(sesion(RolUsuario.SUPERADMIN, null, SUPER), undefined, { params: { alojamientoId: '2' } }).ctx), true);
    assert.equal(await estadoHttp(() => guard.canActivate(contexto(sesion(RolUsuario.RECEPCION, null, RECEP_A), undefined).ctx)), 403);
    assert.equal(await estadoHttp(() => guard.canActivate(contexto(undefined, undefined).ctx)), 401);
  });
});
