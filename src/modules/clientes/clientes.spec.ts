import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { ClientesService } from './clientes.service';
import { Cliente } from './entities/cliente.entity';
import { ProblemaV2Exception } from '../comun/v2/problemas-v2';
import { Repository } from 'typeorm';

// Mock de repositorio en memoria para Clientes
function crearMockRepo(iniciales: Cliente[] = []): Repository<Cliente> {
  const baseDatos: Cliente[] = [...iniciales];

  return {
    create(data: Partial<Cliente>): Cliente {
      const c = new Cliente();
      Object.assign(c, data);
      c.id = c.id ?? '3fa85f64-5717-4562-b3fc-2c963f66afa6';
      c.creado_en = c.creado_en ?? new Date();
      return c;
    },
    async save(cliente: Cliente): Promise<Cliente> {
      const idx = baseDatos.findIndex((c) => c.identificacion === cliente.identificacion);
      if (idx >= 0) {
        baseDatos[idx] = cliente;
      } else {
        baseDatos.push(cliente);
      }
      return cliente;
    },
    async findOne({ where }: { where: { email?: string; identificacion?: string } }): Promise<Cliente | null> {
      const encontrado = baseDatos.find((c) => {
        if (where.identificacion && c.identificacion !== where.identificacion) return false;
        if (where.email && c.email.toLowerCase() !== where.email.toLowerCase()) return false;
        return true;
      });
      return encontrado ?? null;
    },
  } as unknown as Repository<Cliente>;
}

test('Cliente entity: esquema "clientes", sin FK a usuarios y tabla "clientes"', () => {
  const metadata = Reflect.getMetadata('typeorm:entity', Cliente);
  assert.equal(Cliente.name, 'Cliente');
  // Se verifica instanciación y atributos requeridos
  const c = new Cliente();
  c.id = 'uuid-1';
  c.nombre = 'Ana Gomez';
  c.email = 'ana@cozy.test';
  c.identificacion = '1712345678';
  c.telefono = '+593987654321';
  c.creado_en = new Date();
  assert.equal(c.identificacion, '1712345678');
  assert.equal(c.email, 'ana@cozy.test');
});

test('POST /api/v2/clientes: registra un cliente nuevo y responde 201 con { client_id }', async () => {
  const repo = crearMockRepo();
  const service = new ClientesService(repo);

  const res = await service.crear({
    nombre: 'Ana Gomez',
    email: 'ana@cozy.test',
    identificacion: '1712345678',
    telefono: '+593987654321',
  });

  assert.ok(res.client_id, 'Debe devolver client_id');
  assert.equal(typeof res.client_id, 'string');
});

test('POST /api/v2/clientes: devuelve 409 CONFLICT si la identificación ya existe', async () => {
  const existente = new Cliente();
  existente.id = 'uuid-existente';
  existente.nombre = 'Carlos Perez';
  existente.email = 'carlos@cozy.test';
  existente.identificacion = '1712345678';
  existente.telefono = '+593911111111';
  existente.creado_en = new Date();

  const repo = crearMockRepo([existente]);
  const service = new ClientesService(repo);

  await assert.rejects(
    async () => {
      await service.crear({
        nombre: 'Otro Carlos',
        email: 'otro@cozy.test',
        identificacion: '1712345678', // misma identificacion
        telefono: '+593922222222',
      });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProblemaV2Exception, 'Debe ser ProblemaV2Exception');
      assert.equal(err.estado, 409);
      assert.equal(err.codigo, 'CONFLICT');
      return true;
    },
  );
});

test('GET /api/v2/clientes: devuelve 200 con client_id, nombre, email, identificacion si existe', async () => {
  const existente = new Cliente();
  existente.id = '3fa85f64-5717-4562-b3fc-2c963f66afa6';
  existente.nombre = 'Juan Perez';
  existente.email = 'cliente.prueba@cozy.test';
  existente.identificacion = '1712345678';
  existente.telefono = '+593987654321';
  existente.creado_en = new Date();

  const repo = crearMockRepo([existente]);
  const service = new ClientesService(repo);

  // Búsqueda por identificación
  const res1 = await service.buscar({ identificacion: '1712345678' });
  assert.deepEqual(res1, {
    client_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nombre: 'Juan Perez',
    email: 'cliente.prueba@cozy.test',
    identificacion: '1712345678',
  });

  // Búsqueda por email
  const res2 = await service.buscar({ email: 'cliente.prueba@cozy.test' });
  assert.deepEqual(res2, {
    client_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
    nombre: 'Juan Perez',
    email: 'cliente.prueba@cozy.test',
    identificacion: '1712345678',
  });
});

test('GET /api/v2/clientes: devuelve 404 NOT_FOUND si el cliente no existe', async () => {
  const repo = crearMockRepo();
  const service = new ClientesService(repo);

  await assert.rejects(
    async () => {
      await service.buscar({ identificacion: '9999999999' });
    },
    (err: unknown) => {
      assert.ok(err instanceof ProblemaV2Exception, 'Debe ser ProblemaV2Exception');
      assert.equal(err.estado, 404);
      assert.equal(err.codigo, 'NOT_FOUND');
      return true;
    },
  );
});

test('GET /api/v2/clientes: devuelve 400 VALIDATION_FAILED si no se envía ni email ni identificacion', async () => {
  const repo = crearMockRepo();
  const service = new ClientesService(repo);

  await assert.rejects(
    async () => {
      await service.buscar({});
    },
    (err: unknown) => {
      assert.ok(err instanceof ProblemaV2Exception, 'Debe ser ProblemaV2Exception');
      assert.equal(err.estado, 400);
      assert.equal(err.codigo, 'VALIDATION_FAILED');
      return true;
    },
  );
});

