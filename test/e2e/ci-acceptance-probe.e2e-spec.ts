import { it } from 'vitest';

it('verifies the e2e failure gate', () => {
  throw new Error('CI acceptance probe: e2e');
});
