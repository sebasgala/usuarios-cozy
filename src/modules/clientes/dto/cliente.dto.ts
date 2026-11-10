import { IsEmail, IsNotEmpty, IsOptional, IsString, Matches, MaxLength, MinLength } from 'class-validator';

export class CrearClienteDto {
  @IsNotEmpty({ message: 'nombre es obligatorio' })
  @IsString({ message: 'nombre debe ser una cadena de texto' })
  @MinLength(2, { message: 'nombre debe tener al menos 2 caracteres' })
  @MaxLength(120, { message: 'nombre no puede exceder 120 caracteres' })
  nombre: string;

  @IsNotEmpty({ message: 'email es obligatorio' })
  @IsEmail({}, { message: 'email debe ser un correo electrónico válido' })
  @MaxLength(255, { message: 'email no puede exceder 255 caracteres' })
  email: string;

  @IsNotEmpty({ message: 'identificacion es obligatoria' })
  @IsString({ message: 'identificacion debe ser una cadena de texto' })
  @Matches(/^[A-Za-z0-9]{6,13}$/, { message: 'identificacion debe tener entre 6 y 13 caracteres alfanuméricos' })
  identificacion: string;

  @IsNotEmpty({ message: 'telefono es obligatorio' })
  @IsString({ message: 'telefono debe ser una cadena de texto' })
  @Matches(/^(\+[0-9]{8,15}|09[0-9]{8})$/, { message: 'telefono debe tener un formato internacional (+...) o móvil válido' })
  telefono: string;
}

export class BuscarClienteQuery {
  @IsOptional()
  @IsEmail({}, { message: 'email debe ser un correo electrónico válido' })
  email?: string;

  @IsOptional()
  @Matches(/^[A-Za-z0-9]{6,13}$/, { message: 'identificacion debe tener entre 6 y 13 caracteres alfanuméricos' })
  identificacion?: string;
}

export interface ClienteResponseDto {
  client_id: string;
  nombre: string;
  email: string;
  identificacion: string;
}

export interface CrearClienteResponseDto {
  client_id: string;
}

