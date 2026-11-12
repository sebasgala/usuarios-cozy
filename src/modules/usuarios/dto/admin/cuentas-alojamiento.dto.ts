import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { REGLA_CONTRASENA, UsuarioResponseDto } from '../auth/auth.dto';

export class CreateAlojamientoDto {
  [key: string]: any;
}

export class AlojamientoResponseDto {
  [key: string]: any;
}

// Datos de una cuenta nueva del Bloque R. Sin `password` se genera una clave temporal (requiereCambioClave = true).
export class DatosCuentaNuevaDto {
  @ApiProperty({ example: 'recepcion@hotel.test', maxLength: 255 })
  @MaxLength(255, { message: 'no puede superar 255 caracteres' })
  @IsEmail({}, { message: 'formato inválido' })
  @IsNotEmpty({ message: 'es obligatorio' })
  email: string;

  @ApiProperty({ example: 'Ana', maxLength: 120 })
  @MaxLength(120, { message: 'no puede superar 120 caracteres' })
  @Matches(/\S/, { message: 'no puede estar vacío' })
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  nombre: string;

  @ApiProperty({ example: 'Pérez', maxLength: 120 })
  @MaxLength(120, { message: 'no puede superar 120 caracteres' })
  @Matches(/\S/, { message: 'no puede estar vacío' })
  @IsString({ message: 'debe ser texto' })
  @IsNotEmpty({ message: 'es obligatorio' })
  apellido: string;

  @ApiPropertyOptional({ description: 'Si se omite se genera una clave temporal que se devuelve una sola vez', minLength: 8, maxLength: 72 })
  @IsOptional()
  @Matches(REGLA_CONTRASENA, { message: 'debe incluir al menos una letra y un número' })
  @MaxLength(72, { message: 'no puede superar 72 caracteres' })
  @MinLength(8, { message: 'debe tener al menos 8 caracteres' })
  @IsString({ message: 'debe ser texto' })
  password?: string;
}

// R4: alojamiento nuevo y su primer ADMIN_ALOJAMIENTO (solo superadmin)
export class CrearAlojamientoConAdministradorDto {
  @ApiProperty({ type: () => CreateAlojamientoDto })
  @ValidateNested()
  @Type(() => CreateAlojamientoDto)
  @IsNotEmpty({ message: 'es obligatorio' })
  alojamiento: CreateAlojamientoDto;

  @ApiProperty({ type: () => DatosCuentaNuevaDto })
  @ValidateNested()
  @Type(() => DatosCuentaNuevaDto)
  @IsNotEmpty({ message: 'es obligatorio' })
  administrador: DatosCuentaNuevaDto;
}

export class CuentaCreadaDto extends UsuarioResponseDto {
  @ApiPropertyOptional({ description: 'Clave temporal, solo cuando no se envió password. Se muestra UNA vez.' })
  claveTemporal?: string;
}

export class AlojamientoConAdministradorDto {
  @ApiProperty({ type: () => AlojamientoResponseDto })
  alojamiento: AlojamientoResponseDto;

  @ApiProperty({ type: () => CuentaCreadaDto })
  administrador: CuentaCreadaDto;
}
