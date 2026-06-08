import type {
  AuthResult,
  JwtPayload,
  LoginUserDto,
  PublicUser,
  RegisterUserDto,
  User,
} from '@app/contracts';
import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import * as bcrypt from 'bcrypt';

const SALT_ROUNDS = 10;

@Injectable()
export class UsersService {
  private readonly users = new Map<string, User>();
  private readonly idsByEmail = new Map<string, string>();

  constructor(private readonly jwtService: JwtService) {}

  async register(dto: RegisterUserDto): Promise<AuthResult> {
    const email = dto.email.toLowerCase();
    if (this.idsByEmail.has(email)) {
      throw new ConflictException(`Email ${dto.email} is already registered`);
    }

    const now = new Date().toISOString();
    const user: User = {
      id: randomUUID(),
      email,
      name: dto.name,
      passwordHash: await bcrypt.hash(dto.password, SALT_ROUNDS),
      createdAt: now,
      updatedAt: now,
    };

    this.users.set(user.id, user);
    this.idsByEmail.set(email, user.id);

    return this.buildAuthResult(user);
  }

  async login(dto: LoginUserDto): Promise<AuthResult> {
    const id = this.idsByEmail.get(dto.email.toLowerCase());
    const user = id ? this.users.get(id) : undefined;

    if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
      throw new UnauthorizedException('Invalid email or password');
    }

    return this.buildAuthResult(user);
  }

  verify(token: string): PublicUser {
    let payload: JwtPayload;

    try {
      payload = this.jwtService.verify<JwtPayload>(token);
    } catch {
      throw new UnauthorizedException('Invalid or expired token');
    }

    const user = this.users.get(payload.sub);
    if (!user) {
      throw new UnauthorizedException('Invalid or expired token');
    }

    return this.toPublicUser(user);
  }

  private buildAuthResult(user: User): AuthResult {
    return {
      accessToken: this.jwtService.sign({ sub: user.id, email: user.email }),
      user: this.toPublicUser(user),
    };
  }

  private toPublicUser(user: User): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
