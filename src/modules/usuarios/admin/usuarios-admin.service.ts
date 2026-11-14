import { Injectable } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import * as bcrypt from 'bcryptjs';
import { DataSource, FindOptionsWhere, Repository } from 'typeorm';
import { EstadoUsuario, RolUsuario, Usuario } from '../entities/usuario.entity';
import { UsuarioResponseDto } from '../dto/auth/auth.dto';
import { CuentaCreadaDto } from '../dto/admin/cuentas-alojamiento.dto';
import { CambiarRolDto, CrearUsuarioAdminDto, FiltroUsuariosQueryDto, UsuariosPaginadosDto } from '../dto/admin/usuario-admin.dto';
import { ConflictoException, ConsultaInvalidaException, RecursoNoEncontradoException } from '../../comun/problems/problem-details.exceptions';
import { esUuid } from '../../comun/alojamientos-consulta.utils';
import { AuditoriaService } from '../../comun/auditoria.service';
import { AuthService, COSTE_BCRYPT } from '../seguridad/auth.service';
import { generarClaveTemporal } from './cuentas-alojamiento.service';
import { SesionJwt } from '../seguridad/seguridad.tipos';
import { CONEXION } from '../../../database/conexiones';

// Gestión de cuentas por el superadmin. Todas las acciones son idempotentes: repetir una que ya está
// aplicada devuelve el usuario tal cual (200) y no escribe auditoría.
@Injectable()
export class UsuariosAdminService {
  constructor(
    @InjectRepository(Usuario, CONEXION.usuarios)
    private readonly usuariosRepository: Repository<Usuario>,
    @InjectDataSource(CONEXION.usuarios)
    private readonly dataSource: DataSource,
    private readonly auditoria: AuditoriaService,
    private readonly authService: AuthService,
  ) {}

  async listar(filtro: FiltroUsuariosQueryDto): Promise<UsuariosPaginadosDto> {
    const pagina = filtro.page ?? 1;
    const limite = filtro.limit ?? 10;
    const where: FindOptionsWhere<Usuario> = {};
    if (filtro.rol) where.rol = filtro.rol;
    if (filtro.estado) where.estado = filtro.estado;
    const [usuarios, total] = await this.usuariosRepository.findAndCount({
      where,
      order: { createdAt: 'DESC', id: 'ASC' },
      skip: (pagina - 1) * limite,
      take: limite,
    });
    return {
      data: usuarios.map((u) => this.authService.aRespuesta(u)),
      meta: { totalItems: total, itemCount: usuarios.length, itemsPerPage: limite, totalPages: Math.ceil(total / limite), currentPage: pagina },
    };
  }

  async crear(dto: CrearUsuarioAdminDto, actor: SesionJwt): Promise<CuentaCreadaDto> {
    const email = dto.email.trim().toLowerCase();
    if (await this.usuariosRepository.existsBy({ email })) {
      throw new ConflictoException('VALIDATION_FAILED', 'Ya existe una cuenta con ese correo', [{ name: 'email', reason: 'ya está registrado' }]);
    }
    const alojamientoId = this.resolverAlojamientoParaRol(dto.rol, dto.alojamientoId ?? null);
    const claveTemporal = dto.password ? undefined : generarClaveTemporal();
    const usuario = this.usuariosRepository.create({
      email,
      passwordHash: await bcrypt.hash(dto.password ?? claveTemporal, COSTE_BCRYPT),
      nombre: dto.nombre.trim(),
      apellido: dto.apellido.trim(),
      rol: dto.rol,
      estado: EstadoUsuario.ACTIVO,
      alojamientoId,
      requiereCambioClave: claveTemporal !== undefined,
    });
    const guardado = await this.dataSource.transaction(async (manager) => {
      const g = await manager.save(usuario);
      await this.auditoria.registrar(manager, {
        modulo: 'usuarios',
        usuarioId: actor.id,
        accion: 'crear_usuario_admin',
        entidad: 'usuario',
        entidadId: g.id,
        despues: { email: g.email, rol: g.rol, alojamientoId: g.alojamientoId, requiereCambioClave: g.requiereCambioClave },
      });
      return g;
    });
    return { ...this.authService.aRespuesta(guardado), ...(claveTemporal && { claveTemporal }) };
  }

  // pendiente -> activo. Activo: no hace nada. Suspendido: 409 (para eso está "reactivar").
  async aprobar(id: string, actor: SesionJwt): Promise<UsuarioResponseDto> {
    const usuario = await this.buscar(id);
    if (usuario.estado === EstadoUsuario.SUSPENDIDO) {
      throw this.conflicto('La cuenta está suspendida: usa "reactivar"', 'estado');
    }
    return this.cambiarEstado(usuario, EstadoUsuario.ACTIVO, 'aprobar', actor);
  }

  // activo -> suspendido. Suspendido: no hace nada. Pendiente: 409 (no tiene sesión que suspender; se deja pendiente).
  async suspender(id: string, actor: SesionJwt): Promise<UsuarioResponseDto> {
    const usuario = await this.buscar(id);
    if (usuario.id === actor.id) throw this.conflicto('No puedes suspender tu propia cuenta', 'id');
    if (usuario.estado === EstadoUsuario.PENDIENTE) {
      throw this.conflicto('La cuenta está pendiente de aprobación: no hay nada que suspender', 'estado');
    }
    return this.cambiarEstado(usuario, EstadoUsuario.SUSPENDIDO, 'suspender', actor);
  }

  // suspendido -> activo. Activo: no hace nada. Pendiente: 409 (para eso está "aprobar").
  async reactivar(id: string, actor: SesionJwt): Promise<UsuarioResponseDto> {
    const usuario = await this.buscar(id);
    if (usuario.estado === EstadoUsuario.PENDIENTE) {
      throw this.conflicto('La cuenta está pendiente de aprobación: usa "aprobar"', 'estado');
    }
    return this.cambiarEstado(usuario, EstadoUsuario.ACTIVO, 'reactivar', actor);
  }

  async cambiarRol(id: string, dto: CambiarRolDto, actor: SesionJwt): Promise<UsuarioResponseDto> {
    const usuario = await this.buscar(id);
    if (usuario.id === actor.id && usuario.rol !== dto.rol) throw this.conflicto('No puedes cambiar tu propio rol', 'id');
    const nuevoAlojamiento = this.resolverAlojamientoParaRol(dto.rol, dto.alojamientoId ?? usuario.alojamientoId ?? null);
    if (usuario.rol === dto.rol && usuario.alojamientoId === nuevoAlojamiento) return this.authService.aRespuesta(usuario);
    const antes = { rol: usuario.rol, alojamientoId: usuario.alojamientoId };
    usuario.rol = dto.rol;
    usuario.alojamientoId = nuevoAlojamiento;
    await this.guardar(usuario, 'cambiar_rol', antes, { rol: usuario.rol, alojamientoId: usuario.alojamientoId }, actor);
    return this.authService.aRespuesta(usuario);
  }

  private resolverAlojamientoParaRol(rol: RolUsuario, alojamientoId: number | null): number | null {
    if (rol === RolUsuario.SUPERADMIN || rol === RolUsuario.CLIENTE) return null;
    if (alojamientoId === null || !Number.isInteger(alojamientoId) || alojamientoId < 1) {
      throw new ConsultaInvalidaException([{ name: 'alojamientoId', reason: `es obligatorio para el rol ${rol}` }], `Debes asignar un alojamiento válido para el rol ${rol}`);
    }
    return alojamientoId;
  }

  // ───────────────────────── Apoyo ─────────────────────────

  private async cambiarEstado(usuario: Usuario, estado: EstadoUsuario, accion: string, actor: SesionJwt): Promise<UsuarioResponseDto> {
    if (usuario.estado !== estado) {
      const antes = { estado: usuario.estado };
      usuario.estado = estado;
      await this.guardar(usuario, accion, antes, { estado }, actor);
    }
    return this.authService.aRespuesta(usuario);
  }

  private guardar(usuario: Usuario, accion: string, antes: Record<string, any>, despues: Record<string, any>, actor: SesionJwt) {
    return this.dataSource.transaction(async (manager) => {
      await manager.save(usuario);
      await this.auditoria.registrar(manager, { modulo: 'usuarios', usuarioId: actor.id, accion, entidad: 'usuario', entidadId: usuario.id, antes, despues });
    });
  }

  private async buscar(id: string): Promise<Usuario> {
    const usuario = esUuid(id) ? await this.usuariosRepository.findOneBy({ id }) : null;
    if (!usuario) {
      const reason = `El usuario ${id} no existe`;
      throw new RecursoNoEncontradoException(reason, [{ name: 'id', reason }]);
    }
    return usuario;
  }

  private conflicto(detalle: string, parametro: string): ConflictoException {
    return new ConflictoException('VALIDATION_FAILED', detalle, [{ name: parametro, reason: detalle }]);
  }
}

