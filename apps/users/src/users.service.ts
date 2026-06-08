import {
  type AuthResult,
  type JwtPayload,
  LoginUserDto,
  type PublicUser,
  RegisterUserDto,
  RpcErrors,
} from '@app/contracts';
import { Injectable } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import * as bcrypt from 'bcrypt';
import { UserEntity } from './entities/user.entity';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly jwtService: JwtService,
  ) {}

  async register(dto: RegisterUserDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    if (await this.users.findOneBy({ email })) {
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

    return this.buildAuthResult(user);
  }

  async login(dto: LoginUserDto): Promise<AuthResult> {
    const user = await this.users.findOneBy({ email: dto.email.toLowerCase() });

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw RpcErrors.unauthorized('Invalid email or password');
    }

    return this.buildAuthResult(user);
  }

  async verify(token: string): Promise<PublicUser> {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

    const user = await this.users.findOneBy({ id: payload.sub });
    if (!user) {
      throw RpcErrors.unauthorized('Invalid or expired token');
    }

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
