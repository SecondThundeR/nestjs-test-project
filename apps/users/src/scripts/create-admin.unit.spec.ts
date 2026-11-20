import { expect, it } from 'vitest';
import { adminCredentialsSchema } from './create-admin.js';

it('rejects short administrator passwords', () => {
  const result = adminCredentialsSchema.safeParse({
    email: 'Owner@example.com',
    name: 'Owner',
    password: 'short',
  });

  expect(result.success).toBe(false);
});
