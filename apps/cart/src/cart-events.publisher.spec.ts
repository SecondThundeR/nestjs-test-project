import { Test } from '@nestjs/testing';
import { KAFKA_CLIENT } from '@app/config';
import { of, throwError } from 'rxjs';

import { CartEventsPublisher } from './cart-events.publisher.js';

describe('CartEventsPublisher', () => {
  it('connects, publishes keyed events, tolerates delivery failures and closes', async () => {
    const kafka = {
      connect: vi.fn(),
      close: vi.fn(),
      emit: vi.fn(() => of(undefined)),
    };
    const module = await Test.createTestingModule({
      providers: [
        CartEventsPublisher,
        { provide: KAFKA_CLIENT, useValue: kafka },
      ],
    }).compile();
    const publisher = module.get(CartEventsPublisher);
    await publisher.onModuleInit();
    publisher.updated('alice');
    expect(kafka.emit).toHaveBeenCalledWith('cart.updated', {
      key: 'alice',
      value: { userId: 'alice' },
    });
    kafka.emit.mockReturnValueOnce(
      throwError(() => new Error('Kafka unavailable')),
    );
    expect(() => publisher.updated('alice')).not.toThrow();
    await publisher.onApplicationShutdown();
    expect(kafka.connect).toHaveBeenCalledOnce();
    expect(kafka.close).toHaveBeenCalledOnce();
  });
});
