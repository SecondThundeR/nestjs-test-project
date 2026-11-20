import { it } from 'vitest';

it('verifies the integration failure gate', () => {
  throw new Error('CI acceptance probe: integration');
});
