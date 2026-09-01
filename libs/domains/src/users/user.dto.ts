import { z } from 'zod';

export const createUserSchema = z.strictObject({
  email: z.email(),
  name: z.string().min(2),
  password: z.string().min(8),
});
export type CreateUserDto = z.infer<typeof createUserSchema>;

export const validateUserByCredentialsSchema = z.strictObject({
  email: z.email(),
  password: z.string().min(1),
});
export type ValidateUserByCredentialsDto = z.infer<
  typeof validateUserByCredentialsSchema
>;
