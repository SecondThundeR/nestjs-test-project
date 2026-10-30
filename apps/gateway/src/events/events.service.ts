import { SERVICE_NAMES } from '@app/config';
import { AUTH_PATTERNS, type JwtPayload } from '@app/domains';
import {
  Inject,
  Injectable,
  Logger,
  type MessageEvent,
  type OnApplicationShutdown,
} from '@nestjs/common';
import type { ClientProxy } from '@nestjs/microservices';
import {
  filter,
  firstValueFrom,
  Observable,
  Subject,
  takeUntil,
  timeout,
} from 'rxjs';

export type Notification = {
  userId: string;
  type: string;
  data: { orderId: string } | Record<string, never>;
};

@Injectable()
export class EventsService implements OnApplicationShutdown {
  private readonly logger = new Logger(EventsService.name);
  private readonly notifications = new Subject<Notification>();
  private readonly shutdown = new Subject<void>();
  private readonly revokedSessions = new Subject<string>();
  constructor(@Inject(SERVICE_NAMES.AUTH) private readonly auth: ClientProxy) {}

  publish(notification: Notification): void {
    this.notifications.next(notification);
  }

  closeSession(sessionId: string): void {
    this.revokedSessions.next(sessionId);
  }

  stream(user: JwtPayload & { exp?: number }): Observable<MessageEvent> {
    return new Observable<MessageEvent>((subscriber) => {
      let checking = false;
      let closed = false;
      // Coalesce refresh hints while authorization is being checked.
      const pending = new Map<string, Notification>();
      const verify = async (heartbeat = false): Promise<void> => {
        if (checking || closed) return;
        checking = true;
        try {
          if (user.exp !== undefined && user.exp * 1000 <= Date.now()) {
            subscriber.complete();
            return;
          }
          await firstValueFrom(
            this.auth.send(AUTH_PATTERNS.VERIFY, user.sid).pipe(timeout(5000)),
          );
          if (closed) return;
          for (const event of pending.values())
            subscriber.next({ type: event.type, data: event.data });
          pending.clear();
          if (heartbeat) subscriber.next({ type: 'heartbeat', data: {} });
        } catch {
          this.logger.debug(
            'Closing SSE connection after session verification failed',
          );
          subscriber.complete();
        } finally {
          checking = false;
        }
      };
      const subscription = this.notifications.subscribe((event) => {
        if (event.userId !== user.sub) return;
        pending.set(
          event.type + ('orderId' in event.data ? event.data.orderId : ''),
          event,
        );
        // Bound queued hints for slow authorization dependencies.
        if (pending.size > 100) {
          subscriber.complete();
          return;
        }
        void verify();
      });
      const heartbeat = setInterval(() => {
        void verify(true);
      }, 15000);
      const expiry =
        user.exp === undefined
          ? undefined
          : setTimeout(
              () => subscriber.complete(),
              Math.min(Math.max(0, user.exp * 1000 - Date.now()), 2147483647),
            );
      subscriber.next({ type: 'ready', data: {} });
      return () => {
        closed = true;
        pending.clear();
        subscription.unsubscribe();
        clearInterval(heartbeat);
        clearTimeout(expiry);
      };
    }).pipe(
      takeUntil(this.shutdown),
      takeUntil(
        this.revokedSessions.pipe(
          filter((sessionId) => sessionId === user.sid),
        ),
      ),
    );
  }

  onApplicationShutdown(): void {
    this.shutdown.next();
    this.shutdown.complete();
    this.notifications.complete();
    this.revokedSessions.complete();
  }
}
