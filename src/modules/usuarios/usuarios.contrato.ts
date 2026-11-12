import { RolUsuario, Usuario } from './entities/usuario.entity';

// Contrato de identidad que usuarios ofrece a los otros dominios (fase 8.0): el usuario de la sesión tal como lo
// deja JwtAuthGuard. Los demás dominios solo ven esto, nunca la entidad ni la tabla `usuarios`.
// Fase 8.1: estos datos salen del token (id, rol y estado, vida de 10 minutos); no se lee la base en cada petición.
// Bloque R: alojamientoId viaja en el token para el aislamiento de recepción y administradores.
export { RolUsuario };

export type UsuarioSesion = Pick<Usuario, 'id' | 'rol' | 'alojamientoId'>;

// Devuelve el alojamientoId que restringe las consultas del usuario. SUPERADMIN ve todo (undefined = sin filtro).
export function alojamientoDeSesion(usuario: UsuarioSesion): number | undefined {
  if (usuario.rol === RolUsuario.SUPERADMIN) return undefined;
  return usuario.alojamientoId ?? undefined;
}
