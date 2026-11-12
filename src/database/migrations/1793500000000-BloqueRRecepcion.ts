import { MigrationInterface, QueryRunner } from 'typeorm';

// Bloque R (R2 y R9): roles de recepción, pertenencia de las cuentas a un alojamiento.
//   usuarios.usuarios
//     - rol: se agrega el valor 'recepcion' al enum
//     - alojamientoId int NULL: referencia lógica a catalogo.alojamientos (sin FK entre dominios, regla 8.1)
//     - requiereCambioClave boolean NOT NULL DEFAULT false: cuentas creadas con clave temporal
//     - CHK_usuarios_alojamiento_por_rol: superadmin y cliente sin alojamiento; recepción siempre con uno; administrador libre
//       (las cuentas anteriores al Bloque R administran por alojamientos.propietarioId). Se compara "rol"::text para poder
//       usar el valor nuevo del enum en la misma transacción.
//     - relleno: cada administrador existente queda con el menor id de los alojamientos de los que es propietario.
export class BloqueRRecepcion1793500000000 implements MigrationInterface {
  name = 'BloqueRRecepcion1793500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TYPE "usuarios"."usuarios_rol_enum" ADD VALUE IF NOT EXISTS 'recepcion'`);
    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" ADD COLUMN IF NOT EXISTS "alojamientoId" integer`);
    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" ADD COLUMN IF NOT EXISTS "requiereCambioClave" boolean NOT NULL DEFAULT false`);
    await queryRunner.query(`CREATE INDEX IF NOT EXISTS "IX_usuarios_alojamientoId" ON "usuarios"."usuarios" ("alojamientoId")`);

    // Relleno de los administradores existentes (solo si el catálogo está en esta misma base)
    const [{ existe }] = await queryRunner.query(`SELECT to_regclass('catalogo.alojamientos') IS NOT NULL AS "existe"`);
    if (existe) {
      await queryRunner.query(`
        UPDATE "usuarios"."usuarios" u
        SET "alojamientoId" = (SELECT MIN(a."id") FROM "catalogo"."alojamientos" a WHERE a."propietarioId" = u."id")
        WHERE u."rol"::text = 'administrador' AND u."alojamientoId" IS NULL
      `);
    }

    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" DROP CONSTRAINT IF EXISTS "CHK_usuarios_alojamiento_por_rol"`);
    await queryRunner.query(`
      ALTER TABLE "usuarios"."usuarios" ADD CONSTRAINT "CHK_usuarios_alojamiento_por_rol" CHECK (
        ("rol"::text IN ('superadmin', 'cliente') AND "alojamientoId" IS NULL)
        OR ("rol"::text = 'recepcion' AND "alojamientoId" IS NOT NULL)
        OR "rol"::text = 'administrador'
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" DROP CONSTRAINT IF EXISTS "CHK_usuarios_alojamiento_por_rol"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "usuarios"."IX_usuarios_alojamientoId"`);
    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" DROP COLUMN IF EXISTS "requiereCambioClave"`);
    await queryRunner.query(`ALTER TABLE "usuarios"."usuarios" DROP COLUMN IF EXISTS "alojamientoId"`);
    // PostgreSQL no quita valores de un enum: las cuentas 'recepcion' deben cambiarse o eliminarse antes de revertir.
    const [{ total }] = await queryRunner.query(`SELECT COUNT(*)::int AS total FROM "usuarios"."usuarios" WHERE "rol"::text = 'recepcion'`);
    if (total > 0) throw new Error(`No se revierte: hay ${total} cuenta(s) con rol recepcion`);
  }
}
