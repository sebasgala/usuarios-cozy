import { MigrationInterface, QueryRunner } from 'typeorm';

// Anexo v2: módulo de clientes con esquema propio "clientes" (sin FK a usuarios).
//   clientes.clientes:
//     - id uuid (PK)
//     - nombre character varying(120) NOT NULL
//     - email character varying(255) NOT NULL
//     - identificacion character varying(50) NOT NULL UNIQUE
//     - telefono character varying(50) NOT NULL
//     - creado_en timestamptz NOT NULL DEFAULT now()
export class ModuloClientes1793400000000 implements MigrationInterface {
  name = 'ModuloClientes1793400000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`CREATE SCHEMA IF NOT EXISTS "clientes"`);
    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "clientes"."clientes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "nombre" character varying(120) NOT NULL,
        "email" character varying(255) NOT NULL,
        "identificacion" character varying(50) NOT NULL,
        "telefono" character varying(50) NOT NULL,
        "creado_en" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clientes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_clientes_identificacion" UNIQUE ("identificacion")
      )
    `);
    await queryRunner.query(
      `CREATE UNIQUE INDEX IF NOT EXISTS "UQ_clientes_identificacion" ON "clientes"."clientes" ("identificacion")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "clientes"."clientes"`);
    await queryRunner.query(`DROP SCHEMA IF EXISTS "clientes"`);
  }
}

