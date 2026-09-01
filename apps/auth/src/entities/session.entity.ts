import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryColumn,
} from 'typeorm';

import {
  isoTransformer,
  nullableIsoTransformer,
} from '../../../../libs/config/src/index.js';
import type { Session } from '../../../../libs/domains/src/index.js';

@Entity('sessions')
export class SessionEntity implements Session {
  @PrimaryColumn({ type: 'varchar' })
  id!: string;

  @Index()
  @Column()
  userId!: string;

  @Index({ unique: true })
  @Column()
  refreshTokenHash!: string;

  @Column({ type: 'timestamptz', transformer: isoTransformer })
  expiresAt!: string;

  @Column({
    type: 'timestamptz',
    nullable: true,
    transformer: nullableIsoTransformer,
  })
  revokedAt!: string | null;

  @CreateDateColumn({ type: 'timestamptz', transformer: isoTransformer })
  createdAt!: string;
}
