import {
  type AuthResult,
  type JwtPayload,
  type LogoutResult,
  ValidateUserByCredentialsDto,
  type PublicUser,
  RefreshTokenDto,
  CreateUserDto,
  USERS_PATTERNS,
} from '@app/domains';
import { CacheService } from '@app/cache';
import { authConfig, type AuthConfig, SERVICE_NAMES } from '@app/config';
import { RpcErrors } from '@app/filters';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { type ClientProxy, RpcException } from '@nestjs/microservices';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { firstValueFrom } from 'rxjs';
import { SessionEntity } from './entities/session.entity';

const REFRESH_TOKEN_BYTES = 48;

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

function sessionCacheKey(sessionId: string): string {
  return `session:${sessionId}`;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    @Inject(SERVICE_NAMES.USERS)
    private readonly users: ClientProxy,
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: AuthConfig,
    private readonly cache: CacheService,
  ) {}

  async register(dto: CreateUserDto): Promise<AuthResult> {
    const user = await this.usersCall<PublicUser>(USERS_PATTERNS.CREATE, dto);
    return this.openSession(user);
  }

  async login(dto: ValidateUserByCredentialsDto): Promise<AuthResult> {
    const user = await this.usersCall<PublicUser>(
      USERS_PATTERNS.VALIDATE_CREDENTIALS,
      dto,
    );

    this.logger.log(`User ${user.id} (${user.email}) logged in`);
    return this.openSession(user);
  }

  async verify(sessionId: string): Promise<PublicUser> {
    // JWT guard already verified that passed token is valid
    // This method only validates if current session is active or not
    const session = await this.loadActiveSession(sessionId);
    if (!session) {
      this.logger.warn(`Session ${sessionId} is not active`);
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    const user = await this.usersCall<PublicUser | null>(
      USERS_PATTERNS.FIND_BY_ID,
      session.userId,
    );
    if (!user) {
      this.logger.warn(
        `Session ${sessionId} refers to a user that no longer exists`,
      );
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    this.logger.debug(`Verified session ${sessionId} for user ${user.id}`);
    return user;
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    const session = await this.sessions.findOneBy({
      refreshTokenHash: hashRefreshToken(dto.refreshToken),
    });

    if (!session || !this.isSessionActive(session)) {
      this.logger.warn('Refresh rejected: unknown or inactive session');
      throw RpcErrors.unauthorized('Invalid or expired refresh token');
    }

    const user = await this.usersCall<PublicUser | null>(
      USERS_PATTERNS.FIND_BY_ID,
      session.userId,
    );
    if (!user) {
      this.logger.warn(`Session ${session.id} refers to a missing user`);
      throw RpcErrors.unauthorized('Invalid or expired refresh token');
    }

    const refreshToken = this.generateRefreshToken();
    session.refreshTokenHash = hashRefreshToken(refreshToken);
    session.expiresAt = this.nextExpiresAt();
    await this.sessions.save(session);
    await this.cache.del(sessionCacheKey(session.id));

    this.logger.log(`Rotated session ${session.id} for user ${user.id}`);
    return this.toAuthResult(user, session, refreshToken);
  }

  async logout(sessionId: string): Promise<LogoutResult> {
    const session = await this.sessions.findOneBy({ id: sessionId });

    if (session && this.isSessionActive(session)) {
      session.revokedAt = new Date().toISOString();
      await this.sessions.save(session);
      this.logger.log(`Revoked session ${session.id}`);
    } else {
      this.logger.debug(`Logout for missing or inactive session ${sessionId}`);
    }

    await this.cache.del(sessionCacheKey(sessionId));

    return { success: true };
  }

  @Cron(CronExpression.EVERY_DAY_AT_3AM)
  async cleanupSessions(): Promise<number> {
    const { affected } = await this.sessions.delete([
      { expiresAt: LessThan(new Date().toISOString()) },
      { revokedAt: Not(IsNull()) },
    ]);

    if (affected) {
      this.logger.log(`Cleaned up ${affected} dead session(s)`);
    } else {
      this.logger.debug('No dead sessions to clean up');
    }
    return affected ?? 0;
  }

  private async usersCall<T>(pattern: string, payload: unknown): Promise<T> {
    try {
      return await firstValueFrom(this.users.send<T>(pattern, payload));
    } catch (error) {
      throw new RpcException(error as object);
    }
  }

  private async openSession(user: PublicUser): Promise<AuthResult> {
    const refreshToken = this.generateRefreshToken();
    const session = await this.sessions.save(
      this.sessions.create({
        id: randomUUID(),
        userId: user.id,
        refreshTokenHash: hashRefreshToken(refreshToken),
        expiresAt: this.nextExpiresAt(),
        revokedAt: null,
      }),
    );

    this.logger.log(`Opened session ${session.id} for user ${user.id}`);
    return this.toAuthResult(user, session, refreshToken);
  }

  private nextExpiresAt(): string {
    return new Date(Date.now() + this.auth.refreshTtlMs).toISOString();
  }

  private isSessionActive(session: SessionEntity): boolean {
    return (
      session.revokedAt === null && new Date(session.expiresAt) > new Date()
    );
  }

  private async loadActiveSession(
    sessionId: string,
  ): Promise<SessionEntity | null> {
    const key = sessionCacheKey(sessionId);

    const cached = await this.cache.get<SessionEntity>(key);
    if (cached) {
      return this.isSessionActive(cached) ? cached : null;
    }

    const session = await this.sessions.findOneBy({ id: sessionId });
    if (!session || !this.isSessionActive(session)) {
      return null;
    }

    await this.cache.set(key, session);
    return session;
  }

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private toAuthResult(
    user: PublicUser,
    session: SessionEntity,
    refreshToken: string,
  ): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      sid: session.id,
      role: user.role,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      user,
    };
  }
}
