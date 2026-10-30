import { of, throwError, NEVER } from 'rxjs';
import { UserRole } from '@app/domains';

import { EventsService } from './events.service.js';
import { Test } from '@nestjs/testing';
import { SERVICE_NAMES } from '@app/config';

describe('EventsService', () => {
  const user = {
    sub: 'alice',
    sid: 'session',
    email: 'a@example.com',
    role: UserRole.REGULAR,
  };
  const auth = { send: vi.fn() };
  let service: EventsService;
  beforeEach(async () => {
    vi.useFakeTimers();
    auth.send.mockReturnValue(of({}));
    const module = await Test.createTestingModule({
      providers: [
        EventsService,
        { provide: SERVICE_NAMES.AUTH, useValue: auth },
      ],
    }).compile();
    service = module.get(EventsService);
  });
  afterEach(() => {
    service.onApplicationShutdown();
    vi.useRealTimers();
  });

  it('isolates users and delivers to every connection, including duplicate hints', async () => {
    const alice = vi.fn();
    const second = vi.fn();
    const bob = vi.fn();
    service.stream(user).subscribe(alice);
    service.stream(user).subscribe(second);
    service.stream({ ...user, sub: 'bob' }).subscribe(bob);
    const event = {
      userId: 'alice',
      type: 'order.paid',
      data: { orderId: 'o-1' },
    };
    service.publish(event);
    await vi.advanceTimersByTimeAsync(0);
    service.publish(event);
    await vi.advanceTimersByTimeAsync(0);
    expect(alice).toHaveBeenCalledTimes(3);
    expect(second).toHaveBeenCalledTimes(3);
    expect(bob).toHaveBeenCalledTimes(1);
    expect(alice).toHaveBeenLastCalledWith({
      type: 'order.paid',
      data: { orderId: 'o-1' },
    });
  });
  it('cleans up on disconnect and shutdown', async () => {
    const next = vi.fn();
    const complete = vi.fn();
    const subscription = service.stream(user).subscribe(next);
    subscription.unsubscribe();
    service.stream(user).subscribe({ complete });
    service.onApplicationShutdown();
    await vi.advanceTimersByTimeAsync(30000);
    expect(next).toHaveBeenCalledTimes(1);
    expect(complete).toHaveBeenCalledOnce();
  });
  it('closes every connection for the revoked session while preserving other sessions', () => {
    const first = vi.fn();
    const second = vi.fn();
    const other = vi.fn();
    service.stream(user).subscribe({ complete: first });
    service.stream(user).subscribe({ complete: second });
    service
      .stream({ ...user, sid: 'other-session' })
      .subscribe({ complete: other });
    service.closeSession(user.sid);
    expect(first).toHaveBeenCalledOnce();
    expect(second).toHaveBeenCalledOnce();
    expect(other).not.toHaveBeenCalled();
  });
  it('closes at token expiry', async () => {
    const complete = vi.fn();
    service
      .stream({ ...user, exp: Date.now() / 1000 + 1 })
      .subscribe({ complete });
    await vi.advanceTimersByTimeAsync(1000);
    expect(complete).toHaveBeenCalledOnce();
  });
  it.each(['revoked', 'unavailable', 'timeout'])(
    'closes when auth is %s',
    async (reason) => {
      auth.send.mockReturnValue(
        reason === 'timeout' ? NEVER : throwError(() => new Error(reason)),
      );
      const next = vi.fn();
      const complete = vi.fn();
      service.stream(user).subscribe({ next, complete });
      service.publish({ userId: user.sub, type: 'cart.updated', data: {} });
      await vi.advanceTimersByTimeAsync(5000);
      expect(next).toHaveBeenCalledTimes(1);
      expect(complete).toHaveBeenCalledOnce();
    },
  );
  it('checks sessions during idle heartbeats', async () => {
    const next = vi.fn();
    service.stream(user).subscribe(next);
    await vi.advanceTimersByTimeAsync(15000);
    expect(next).toHaveBeenLastCalledWith({ type: 'heartbeat', data: {} });
  });
});
