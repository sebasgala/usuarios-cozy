import { randomBytes, randomInt } from 'node:crypto';
import { Injectable, Optional, ServiceUnavailableException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, EntityManager, Repository } from 'typeorm';
import { AuditoriaService } from '../../comun/auditoria.service';
import { ConflictoException, ProhibidoException } from '../../comun/problems/problem-details.exceptions';
import { AlojamientoConAdministradorDto, CrearAlojamientoConAdministradorDto, CuentaCreadaDto, DatosCuentaNuevaDto } from '../dto/admin/cuentas-alojamiento.dto';
import { EstadoUsuario, RolUsuario, Usuario } from '../entities/usuario.entity';
import { AuthService, COSTE_BCRYPT } from '../seguridad/auth.service';
import { SesionJwt } from '../seguridad/seguridad.tipos';
import { CONEXION } from '../../../database/conexiones';

// Bloque R (R4 y R5): jerarquía de cuentas por alojamiento.
//   SUPERADMIN          crea un alojamiento y su primer ADMIN_ALOJAMIENTO (crearAlojamientoConAdministrador).
//   ADMIN_ALOJAMIENTO   crea cuentas RECEPCION de SU alojamiento (el del JWT; el cuerpo no puede elegir otro).
// Las cuentas nacen activas; sin contraseña se genera una clave temporal y requiereCambioClave = true.
// El alojamiento vive en el catálogo (otra conexión): se crea primero y, si la cuenta no se puede guardar, se elimina
// (compensación), así nunca queda un alojamiento sin administrador ni una cuenta apuntando a un alojamiento que no existe.

const ALFABETO_CLAVE = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789';

export function generarClaveTemporal(largo = 14): string {
  const letras = Array.from({ length: largo - 2 }, () => ALFABETO_CLAVE[randomInt(ALFABETO_CLAVE.length)]).join('');
  // Cumple REGLA_CONTRASENA (letra y dígito) pase lo que pase con el azar
  return `${letras}${randomInt(10)}${ALFABETO_CLAVE[randomInt(23)]}${randomBytes(1).toString('hex').slice(0, 1)}`;
}

export interface CatalogoDeCuentas {
  crear: (dto: any, actor: SesionJwt) => Promise<{ id: number; [k: string]: any }>;
  asignarPropietario: (id: number, propietarioId: string, actor: SesionJwt) => Promise<any>;
  eliminarRecienCreado: (id: number) => Promise<void>;
}

@Injectable()
export class CuentasAlojamientoService {
  constructor(
    @InjectRepository(Usuario, CONEXION.usuarios)
    private readonly usuariosRepository: Repository<Usuario>,
    @InjectDataSource(CONEXION.usuarios)
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly authService: AuthService,
    // Solo existe en el monolito (en el proceso `usuarios` aparte, el catálogo no está cargado)
    @Optional() private readonly catalogo?: CatalogoDeCuentas,
  ) {}

  // R4: alojamiento + primer administrador. Solo superadmin (lo exige el controlador; se vuelve a comprobar aquí).
  async crearAlojamientoConAdministrador(dto: CrearAlojamientoConAdministradorDto, actor: SesionJwt): Promise<AlojamientoConAdministradorDto> {
    if (actor.rol !== RolUsuario.SUPERADMIN) throw new ProhibidoException('Solo el superadmin crea alojamientos y sus administradores');
    if (!this.catalogo) throw new ServiceUnavailableException('La creación de alojamientos no está disponible en este proceso');
    await this.exigirCorreoLibre(dto.administrador.email);

    const alojamiento = await this.catalogo.crear(dto.alojamiento, actor);
    let administrador: CuentaCreadaDto;
    try {
      administrador = await this.crearCuenta(dto.administrador, RolUsuario.ADMINISTRADOR, alojamiento.id, actor);
    } catch (error) {
      await this.catalogo.eliminarRecienCreado(alojamiento.id);
      throw error;
    }
    const conPropietario = await this.catalogo.asignarPropietario(alojamiento.id, administrador.id, actor);
    return { alojamiento: conPropietario, administrador };
  }

  // R5: recepcionista del alojamiento del actor. El alojamiento sale del JWT, nunca del cuerpo.
  async crearRecepcionista(dto: DatosCuentaNuevaDto, actor: SesionJwt): Promise<CuentaCreadaDto> {
    if (actor.rol !== RolUsuario.ADMINISTRADOR) throw new ProhibidoException('Solo el administrador del alojamiento crea cuentas de recepción');
    if (actor.alojamientoId === null || actor.alojamientoId === undefined) {
      throw new ProhibidoException('Tu cuenta de administrador no tiene alojamiento asignado: pide al superadmin que lo vincule');
    }
    await this.exigirCorreoLibre(dto.email);
    return this.crearCuenta(dto, RolUsuario.RECEPCION, actor.alojamientoId, actor);
  }

  // ───────────────────────── Apoyo ─────────────────────────

  private async crearCuenta(dto: DatosCuentaNuevaDto, rol: RolUsuario, alojamientoId: number, actor: SesionJwt): Promise<CuentaCreadaDto> {
    const claveTemporal = dto.password ? undefined : generarClaveTemporal();
    const usuario = this.usuariosRepository.create({
      email: dto.email.trim().toLowerCase(),
      passwordHash: await bcrypt.hash(dto.password ?? claveTemporal, COSTE_BCRYPT),
      nombre: dto.nombre.trim(),
      apellido: dto.apellido.trim(),
      rol,
      estado: EstadoUsuario.ACTIVO,
      alojamientoId,
      requiereCambioClave: claveTemporal !== undefined,
    });
    const guardado = await this.dataSource.transaction(async (manager: EntityManager) => {
      const g = await manager.save(usuario);
      await this.auditoria.registrar(manager, {
        modulo: 'usuarios',
        usuarioId: actor.id,
        accion: 'crear_cuenta_alojamiento',
        entidad: 'usuario',
        entidadId: g.id,
        despues: { email: g.email, rol: g.rol, alojamientoId: g.alojamientoId, requiereCambioClave: g.requiereCambioClave },
      });
      return g;
    });
    return { ...this.authService.aRespuesta(guardado), ...(claveTemporal && { claveTemporal }) };
  }

  private async exigirCorreoLibre(email: string): Promise<void> {
    if (await this.usuariosRepository.existsBy({ email: email.trim().toLowerCase() })) {
      throw new ConflictoException('VALIDATION_FAILED', 'Ya existe una cuenta con ese correo', [{ name: 'email', reason: 'ya está registrado' }]);
    }
  }
}
