import { RolUsuario, Usuario } from './entities/usuario.entity';

// Contrato de identidad que usuarios ofrece a los otros dominios (fase 8.0): el usuario de la sesión tal como lo
// deja JwtAuthGuard. Los demás dominios solo ven esto, nunca la entidad ni la tabla `usuarios`.
// Fase 8.1: estos datos salen del token (id, rol, estado y alojamiento, vida de 10 minutos); no se lee la base en cada petición.
export { RolUsuario };

export type UsuarioSesion = Pick<Usuario, 'id' | 'rol' | 'alojamientoId'>;

// Bloque R: el alojamiento que la sesión puede ver u operar. undefined = sin restricción (superadmin, o un administrador
// anterior al Bloque R que administra por propietarioId). Nunca se toma de la petición.
export function alojamientoDeSesion(usuario: UsuarioSesion): number | undefined {
  if (usuario.rol === RolUsuario.SUPERADMIN) return undefined;
  return usuario.alojamientoId ?? undefined;
}
