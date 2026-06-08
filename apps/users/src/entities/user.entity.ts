import { isoTransformer, type User } from '@app/contracts';
import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryColumn,
  UpdateDateColumn,
} from 'typeorm';

@Entity('users')
export class UserEntity implements User {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Column({ unique: true })
  email!: string;

  @Column()
  name!: string;

  @Column()
  passwordHash!: string;

  @CreateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  updatedAt!: string;
}
