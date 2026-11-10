import { Injectable, OnModuleInit, Optional } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Cliente } from './entities/cliente.entity';
import { BuscarClienteQuery, ClienteResponseDto, CrearClienteDto, CrearClienteResponseDto } from './dto/cliente.dto';
import { noEncontrado, peticionInvalida, ProblemaV2Exception } from '../comun/v2/problemas-v2';
import { CONEXION } from '../../database/conexiones';

@Injectable()
export class ClientesService implements OnModuleInit {
  constructor(
    @InjectRepository(Cliente, CONEXION.usuarios)
    private readonly clientesRepo: Repository<Cliente>,
    @InjectDataSource(CONEXION.usuarios)
    @Optional()
    private readonly dataSource?: DataSource,
  ) {}

  async onModuleInit(): Promise<void> {
    if (this.dataSource && this.dataSource.isInitialized) {
      await this.dataSource.query(`CREATE SCHEMA IF NOT EXISTS "clientes"`);
      await this.dataSource.query(`
        CREATE TABLE IF NOT EXISTS "clientes"."clientes" (
          "id" uuid PRIMARY KEY DEFAULT uuid_generate_v4(),
          "nombre" character varying(120) NOT NULL,
          "email" character varying(255) NOT NULL,
          "identificacion" character varying(50) NOT NULL,
          "telefono" character varying(50) NOT NULL,
          "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
          CONSTRAINT "UQ_clientes_identificacion" UNIQUE ("identificacion")
        )
      `);
    }
  }

  async crear(dto: CrearClienteDto): Promise<CrearClienteResponseDto> {
    const identificacion = dto.identificacion.trim();
    const existente = await this.clientesRepo.findOne({
      where: { identificacion },
    });
    if (existente) {
      throw new ProblemaV2Exception(
        409,
        'CONFLICT',
        'Ya existe un cliente registrado con esa identificación.',
      );
    }

    const nuevo = this.clientesRepo.create({
      nombre: dto.nombre.trim(),
      email: dto.email.trim().toLowerCase(),
      identificacion,
      telefono: dto.telefono.trim(),
    });

    const guardado = await this.clientesRepo.save(nuevo);
    return { client_id: guardado.id };
  }

  async buscar(query: BuscarClienteQuery): Promise<ClienteResponseDto> {
    const email = query.email?.trim().toLowerCase();
    const identificacion = query.identificacion?.trim();

    if (!email && !identificacion) {
      throw peticionInvalida(
        [
          {
            name: 'email/identificacion',
            reason: 'Se debe proporcionar al menos email o identificacion',
          },
        ],
        'Parámetros de consulta insuficientes.',
      );
    }

    const where: { email?: string; identificacion?: string } = {};
    if (email) where.email = email;
    if (identificacion) where.identificacion = identificacion;

    const cliente = await this.clientesRepo.findOne({ where });
    if (!cliente) {
      throw noEncontrado('No se encontró ningún cliente con los criterios proporcionados.');
    }

    return {
      client_id: cliente.id,
      nombre: cliente.nombre,
      email: cliente.email,
      identificacion: cliente.identificacion,
    };
  }
}

