import { it } from 'vitest';

it('verifies the unit failure gate', () => {
  throw new Error('CI acceptance probe: unit');
});
