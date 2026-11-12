import { Body, Controller, HttpCode, HttpStatus, Post, UseFilters, UseGuards, UsePipes } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { AlojamientoConAdministradorDto, CrearAlojamientoConAdministradorDto, CuentaCreadaDto, DatosCuentaNuevaDto } from '../dto/admin/cuentas-alojamiento.dto';
import { RolUsuario } from '../entities/usuario.entity';
import { ProblemDetailsFilter } from '../../comun/problems/problem-details.filter';
import { respuestaProblema } from '../../comun/problems/respuestas-swagger';
import { validacionAdmin } from '../../comun/problems/validacion.pipes';
import { AislamientoAlojamientoGuard } from '../seguridad/aislamiento-alojamiento.guard';
import { JwtAuthGuard } from '../seguridad/jwt-auth.guard';
import { Roles, UsuarioActual } from '../seguridad/roles.decorator';
import { RolesGuard } from '../seguridad/roles.guard';
import { SesionJwt } from '../seguridad/seguridad.tipos';
import { CuentasAlojamientoService } from './cuentas-alojamiento.service';

const R401 = respuestaProblema(401, 'UNAUTHORIZED: falta el token o no es válido');
const R409 = respuestaProblema(409, 'Ya existe una cuenta con ese correo');

// Bloque R (R4 y R5): cuentas por alojamiento. RECEPCION nunca entra aquí (RolesGuard).
@ApiTags('Interno - Admin')
@ApiBearerAuth('JWT')
@UseGuards(JwtAuthGuard, RolesGuard, AislamientoAlojamientoGuard)
@UsePipes(validacionAdmin())
@UseFilters(ProblemDetailsFilter)
@Controller('admin/cuentas')
export class CuentasAlojamientoController {
  constructor(private readonly cuentas: CuentasAlojamientoService) {}

  @Post('alojamientos')
  @HttpCode(HttpStatus.CREATED)
  @Roles(RolUsuario.SUPERADMIN)
  @ApiOperation({
    summary: 'Crear un alojamiento y su primer administrador (solo superadmin)',
    description: 'Flujo atómico: si la cuenta no se puede crear, el alojamiento se elimina. El administrador queda propietario y vinculado por alojamientoId.',
  })
  @ApiResponse({ status: 201, description: 'Alojamiento y administrador creados', type: AlojamientoConAdministradorDto })
  @ApiResponse(respuestaProblema(400, 'Datos inválidos, campos no permitidos o ciudadId inexistente'))
  @ApiResponse(R401)
  @ApiResponse(respuestaProblema(403, 'FORBIDDEN: solo el superadmin'))
  @ApiResponse(R409)
  crearAlojamientoConAdministrador(@Body() dto: CrearAlojamientoConAdministradorDto, @UsuarioActual() actor: SesionJwt) {
    return this.cuentas.crearAlojamientoConAdministrador(dto, actor);
  }

  @Post('recepcion')
  @HttpCode(HttpStatus.CREATED)
  @Roles(RolUsuario.ADMINISTRADOR)
  @ApiOperation({
    summary: 'Crear una cuenta de recepción de mi alojamiento (solo administrador del alojamiento)',
    description: 'El alojamiento es el del token. Sin password se genera una clave temporal (se devuelve una sola vez) y requiereCambioClave = true.',
  })
  @ApiResponse({ status: 201, description: 'Cuenta de recepción creada', type: CuentaCreadaDto })
  @ApiResponse(respuestaProblema(400, 'Datos inválidos o campos no permitidos'))
  @ApiResponse(R401)
  @ApiResponse(respuestaProblema(403, 'FORBIDDEN: solo el administrador de un alojamiento'))
  @ApiResponse(R409)
  crearRecepcionista(@Body() dto: DatosCuentaNuevaDto, @UsuarioActual() actor: SesionJwt) {
    return this.cuentas.crearRecepcionista(dto, actor);
  }
}
