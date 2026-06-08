import {
  type AuthResult,
  type JwtPayload,
  LoginUserDto,
  type PublicUser,
  RegisterUserDto,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable, Logger } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './entities/user.entity';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly jwtService: JwtService,
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
        passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      }),
    );

    this.logger.log(`Registered user ${user.id} (${email})`);
    return this.buildAuthResult(user);
  }

  async login(dto: LoginUserDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    this.logger.log(`Login attempt for ${email}`);
    const user = await this.users.findOneBy({ email });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      this.logger.warn(`Failed login for ${email}`);
      throw RpcErrors.unauthorized('Invalid email or password');
    }

    this.logger.log(`User ${user.id} (${email}) logged in`);
    return this.buildAuthResult(user);
  }

  async verify(token: string): Promise<PublicUser> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      this.logger.warn('Token verification failed: invalid or expired token');
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

  private buildAuthResult(user: UserEntity): AuthResult {
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: UserEntity): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
