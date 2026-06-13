import { type User, UserRole } from '@app/domains';
import { isoTransformer } from '@app/config';
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

  @Column({ type: 'varchar', default: UserRole.REGULAR })
  role!: UserRole;

  @CreateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  createdAt!: string;

  @UpdateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  updatedAt!: string;
}
