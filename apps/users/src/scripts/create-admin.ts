import { randomUUID } from 'node:crypto';

import { hash } from 'bcrypt';
import type { Repository } from 'typeorm';
import { z } from 'zod';

import { UserRole } from '../../../../libs/domains/src/index.js';
import { UserEntity } from '../entities/user.entity.js';

export const adminCredentialsSchema = z.object({
  email: z.email().transform((email) => email.toLowerCase()),
  name: z.string().trim().min(2),
  password: z
    .string()
    .min(12)
    .refine((value) => Buffer.byteLength(value, 'utf8') <= 72),
});

export async function createAdmin(
  users: Repository<UserEntity>,
  credentials: z.infer<typeof adminCredentialsSchema>,
): Promise<void> {
  const dto = adminCredentialsSchema.parse(credentials);
  if (await users.existsBy({ email: dto.email })) {
    throw new Error('Email is already registered; no account was changed');
  }
  await users.insert({
    id: randomUUID(),
    email: dto.email,
    name: dto.name,
    passwordHash: await hash(dto.password, 10),
    role: UserRole.ADMIN,
  });
}
