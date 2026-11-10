import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

// Entidad del dominio clientes con esquema propio 'clientes', sin FK a usuarios.
@Entity({ name: 'clientes', schema: 'clientes' })
export class Cliente {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'varchar', length: 120 })
  nombre: string;

  @Column({ type: 'varchar', length: 255 })
  email: string;

  @Index('UQ_clientes_identificacion', { unique: true })
  @Column({ type: 'varchar', length: 50, unique: true })
  identificacion: string;

  @Column({ type: 'varchar', length: 50 })
  telefono: string;

  @CreateDateColumn({ type: 'timestamptz', name: 'creado_en' })
  creado_en: Date;
}

