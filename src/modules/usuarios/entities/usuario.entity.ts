import { Check, Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn, UpdateDateColumn } from 'typeorm';

// Roles del roadmap (§7, Bloque R) y su valor en la base:
//   SUPERADMIN        → 'superadmin'     crea alojamientos y sus administradores; alojamientoId NULL
//   ADMIN_ALOJAMIENTO → 'administrador'  administra UN alojamiento (alojamientoId) y crea sus recepcionistas
//   RECEPCION         → 'recepcion'      opera las reservas de su alojamiento (alojamientoId obligatorio)
//   cliente           → cuenta pública de compra; fuera del Bloque R
// El valor 'administrador' se conserva por compatibilidad con los tokens, el frontend y el GraphQL ya desplegados.
export enum RolUsuario {
  CLIENTE = 'cliente',
  ADMINISTRADOR = 'administrador',
  SUPERADMIN = 'superadmin',
  RECEPCION = 'recepcion',
}

export const ROL_ADMIN_ALOJAMIENTO = RolUsuario.ADMINISTRADOR;

// Roles que pertenecen a un alojamiento (alojamientoId obligatorio en las cuentas nuevas del Bloque R)
export const ROLES_DE_ALOJAMIENTO: readonly RolUsuario[] = [RolUsuario.ADMINISTRADOR, RolUsuario.RECEPCION];

export enum EstadoUsuario {
  PENDIENTE = 'pendiente',
  ACTIVO = 'activo',
  SUSPENDIDO = 'suspendido',
}

// Cuenta de acceso. NUNCA se devuelve tal cual en una respuesta: tiene passwordHash.
// Esquema propio del dominio usuarios (fase 8.1): nadie más lee esta tabla.
@Entity({ name: 'usuarios', schema: 'usuarios' })
// superadmin y cliente sin alojamiento; recepción siempre con uno; administrador: obligatorio para las cuentas creadas por el
// Bloque R (lo exige la aplicación) y opcional para las anteriores, que administran por alojamientos.propietarioId.
@Check(
  'CHK_usuarios_alojamiento_por_rol',
  `("rol"::text IN ('superadmin', 'cliente') AND "alojamientoId" IS NULL) OR ("rol"::text = 'recepcion' AND "alojamientoId" IS NOT NULL) OR "rol"::text = 'administrador'`,
)
export class Usuario {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  // Siempre en minúsculas (se normaliza al guardar), así el único no distingue mayúsculas.
  @Column({ type: 'varchar', length: 255, unique: true })
  email: string;

  // Hash bcrypt (coste 12); mide 60 caracteres.
  @Column({ type: 'varchar', length: 100 })
  passwordHash: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 120 })
  apellido: string;

  @Column({ type: 'enum', enum: RolUsuario, default: RolUsuario.CLIENTE })
  rol: RolUsuario;

  // Los administradores nacen 'pendiente' hasta que el superadmin los aprueba; los clientes nacen 'activo'.
  @Column({ type: 'enum', enum: EstadoUsuario, default: EstadoUsuario.ACTIVO })
  estado: EstadoUsuario;

  // Alojamiento al que pertenece la cuenta (referencia lógica a catalogo.alojamientos, sin FK entre dominios: fase 8.1).
  // Es lo que viaja en el JWT y lo que filtra todo lo que la cuenta puede ver u operar.
  @Index('IX_usuarios_alojamientoId')
  @Column({ type: 'int', nullable: true })
  alojamientoId: number | null;

  // Cuenta creada con clave temporal: debe cambiarla en el primer ingreso
  @Column({ type: 'boolean', default: false })
  requiereCambioClave: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
