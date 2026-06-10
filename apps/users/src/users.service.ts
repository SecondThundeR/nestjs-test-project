import {
  type AuthResult,
  type JwtPayload,
  type LogoutResult,
  LoginUserDto,
  type PublicUser,
  RefreshTokenDto,
  RegisterUserDto,
} from '@app/domains';
import { authConfig, type AuthConfig } from '@app/config';
import { RpcErrors } from '@app/filters';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { IsNull, LessThan, Not, Repository } from 'typeorm';
import { hash, compare } from 'bcrypt';
import { UserEntity } from './entities/user.entity';
import { SessionEntity } from './entities/session.entity';

const SALT_ROUNDS = 10;
const REFRESH_TOKEN_BYTES = 48;

function hashRefreshToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    @InjectRepository(SessionEntity)
    private readonly sessions: Repository<SessionEntity>,
    private readonly jwtService: JwtService,
    @Inject(authConfig.KEY)
    private readonly auth: AuthConfig,
  ) {}

  async register(dto: RegisterUserDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();

    this.logger.log(`Registration attempt for ${email}`);

    if (await this.users.findOneBy({ email })) {
      this.logger.warn(`Registration rejected: ${email} already registered`);
      throw RpcErrors.conflict(`Email ${dto.email} is already registered`);
    }

    const user = await this.users.save(
      this.users.create({
        id: randomUUID(),
        email,
        name: dto.name,
        passwordHash: await hash(dto.password, SALT_ROUNDS),
      }),
    );

    this.logger.log(`Registered user ${user.id} (${email})`);
    return this.openSession(user);
  }

  async login(dto: LoginUserDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();

    this.logger.log(`Login attempt for ${email}`);
    const user = await this.users.findOneBy({ email });

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      this.logger.warn(`Failed login for ${email}`);
      throw RpcErrors.unauthorized('Invalid email or password');
    }

    this.logger.log(`User ${user.id} (${email}) logged in`);
    return this.openSession(user);
  }

  async verify(token: string): Promise<PublicUser> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.logger.warn('Token verification failed: invalid or expired token');
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    const session = await this.sessions.findOneBy({ id: payload.sid });
    if (!session || !this.isSessionActive(session)) {
      this.logger.warn(`Token valid but session ${payload.sid} is not active`);
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) {
      this.logger.warn(`Token valid but user ${payload.sub} no longer exists`);
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    this.logger.debug(`Verified token for user ${user.id}`);
    return this.toPublicUser(user);
  }

  async refresh(dto: RefreshTokenDto): Promise<AuthResult> {
    const session = await this.sessions.findOneBy({
      refreshTokenHash: hashRefreshToken(dto.refreshToken),
    });

    if (!session || !this.isSessionActive(session)) {
      this.logger.warn('Refresh rejected: unknown or inactive session');
      throw RpcErrors.unauthorized('Invalid or expired refresh token');
    }

    const user = await this.users.findOneBy({ id: session.userId });
    if (!user) {
      this.logger.warn(`Session ${session.id} refers to a missing user`);
      throw RpcErrors.unauthorized('Invalid or expired refresh token');
    }

    const refreshToken = this.generateRefreshToken();
    session.refreshTokenHash = hashRefreshToken(refreshToken);
    session.expiresAt = this.nextExpiresAt();
    await this.sessions.save(session);

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

  private async openSession(user: UserEntity): Promise<AuthResult> {
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

  private generateRefreshToken(): string {
    return randomBytes(REFRESH_TOKEN_BYTES).toString('base64url');
  }

  private toAuthResult(
    user: UserEntity,
    session: SessionEntity,
    refreshToken: string,
  ): AuthResult {
    const payload: JwtPayload = {
      sub: user.id,
      email: user.email,
      sid: session.id,
    };

    return {
      accessToken: this.jwtService.sign(payload),
      refreshToken,
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: UserEntity): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
