import { Body, Controller, Get, HttpCode, HttpStatus, Post, Query, UseFilters } from '@nestjs/common';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { ClientesService } from './clientes.service';
import { BuscarClienteQuery, ClienteResponseDto, CrearClienteDto, CrearClienteResponseDto } from './dto/cliente.dto';
import { ProblemaV2Filter } from '../comun/v2/problemas-v2';
import { validacionConsultaV2, validacionCuerpoV2 } from '../comun/v2/validacion-v2';

@ApiTags('Contrato v2 - Clientes')
@Controller({ path: 'clientes', version: '2' })
@UseFilters(ProblemaV2Filter)
export class ClientesController {
  constructor(private readonly clientesService: ClientesService) {}

  @Get()
  @ApiOperation({
    operationId: 'obtenerCliente',
    summary: 'Consultar cliente por email o identificación',
  })
  @ApiResponse({ status: 200, description: 'Cliente encontrado' })
  @ApiResponse({ status: 404, description: 'Cliente no encontrado' })
  buscar(@Query(validacionConsultaV2()) query: BuscarClienteQuery): Promise<ClienteResponseDto> {
    return this.clientesService.buscar(query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({
    operationId: 'crearCliente',
    summary: 'Registrar un nuevo cliente',
  })
  @ApiResponse({ status: 201, description: 'Cliente creado' })
  @ApiResponse({ status: 400, description: 'Datos inválidos' })
  @ApiResponse({ status: 409, description: 'Conflicto por identificación duplicada' })
  crear(@Body(validacionCuerpoV2()) dto: CrearClienteDto): Promise<CrearClienteResponseDto> {
    return this.clientesService.crear(dto);
  }
}

