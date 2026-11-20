import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { of, throwError, NEVER, Subject } from 'rxjs';
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
    auth.send.mockReset().mockReturnValue(of({}));
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

  it('does not authorize an already expired token while its expiry timer is pending', () => {
    const complete = vi.fn();
    service
      .stream({ ...user, exp: Math.floor(Date.now() / 1000) - 1 })
      .subscribe({ complete });
    service.publish({ userId: user.sub, type: 'cart.updated', data: {} });
    expect(complete).toHaveBeenCalledOnce();
    expect(auth.send).not.toHaveBeenCalled();
  });

  it('coalesces queued refresh hints during a session check', async () => {
    const verification = new Subject<unknown>();
    auth.send.mockReturnValue(verification);
    const next = vi.fn();
    service.stream(user).subscribe(next);
    const update = { userId: user.sub, type: 'cart.updated', data: {} };
    service.publish(update);
    service.publish(update);
    expect(auth.send).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(1);
    verification.next({});
    await vi.advanceTimersByTimeAsync(0);
    expect(next).toHaveBeenCalledTimes(2);
    expect(next).toHaveBeenLastCalledWith({ type: 'cart.updated', data: {} });
  });

  it('drops the pending update if logout closes the stream during authorization', async () => {
    const verification = new Subject<unknown>();
    auth.send.mockReturnValue(verification);
    const next = vi.fn();
    const complete = vi.fn();
    service.stream(user).subscribe({ next, complete });
    service.publish({ userId: user.sub, type: 'cart.updated', data: {} });
    service.closeSession(user.sid);
    verification.next({});
    await vi.advanceTimersByTimeAsync(0);
    expect(complete).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledExactlyOnceWith({ type: 'ready', data: {} });
  });

  it('closes a stream whose in-flight verification accumulates too many distinct hints', () => {
    auth.send.mockReturnValue(NEVER);
    const next = vi.fn();
    const complete = vi.fn();
    service.stream(user).subscribe({ next, complete });
    for (let index = 0; index < 101; index++) {
      service.publish({
        userId: user.sub,
        type: 'order.paid',
        data: { orderId: String(index) },
      });
    }
    expect(auth.send).toHaveBeenCalledOnce();
    expect(complete).toHaveBeenCalledOnce();
    expect(next).toHaveBeenCalledTimes(1);
  });
});
