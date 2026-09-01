import { randomUUID } from 'node:crypto';

import { CacheService } from '@app/cache';
import {
  CreateUserDto,
  type PublicUser,
  UserRole,
  ValidateUserByCredentialsDto,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { compare, hash } from 'bcrypt';
import { Repository } from 'typeorm';

import { UserEntity } from './entities/user.entity.js';

const SALT_ROUNDS = 10;

function userCacheKey(id: string): string {
  return `user:${id}`;
}

@Injectable()
export class UsersService {
  private readonly logger = new Logger(UsersService.name);

  constructor(
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
    private readonly cache: CacheService,
  ) {}

  async create(dto: CreateUserDto): Promise<PublicUser> {
    const email = dto.email.toLowerCase();

    this.logger.log(`Create attempt for ${email}`);

    if (await this.users.findOneBy({ email })) {
      this.logger.warn(`Create rejected: ${email} already exists`);
      throw RpcErrors.conflict(`Email ${dto.email} is already registered`);
    }

    const user = await this.users.save(
      this.users.create({
        id: randomUUID(),
        email,
        name: dto.name,
        passwordHash: await hash(dto.password, SALT_ROUNDS),
        role: UserRole.REGULAR,
      }),
    );

    this.logger.log(`Created user ${user.id} (${email})`);
    return this.toPublicUser(user);
  }

  async findByCredentials(
    dto: ValidateUserByCredentialsDto,
  ): Promise<PublicUser> {
    const email = dto.email.toLowerCase();

    this.logger.log(`Trying to check credentials for ${email}`);
    const user = await this.users.findOneBy({ email });

    if (!user || !(await compare(dto.password, user.passwordHash))) {
      this.logger.warn(`Failed check credentials for ${email}`);
      throw RpcErrors.unauthorized('Invalid email or password');
    }

    return this.toPublicUser(user);
  }

  async findById(id: string): Promise<PublicUser | null> {
    const key = userCacheKey(id);
    const cached = await this.cache.get<PublicUser>(key);
    if (cached) {
      return cached;
    }

    this.logger.log(`Trying to get user with ID ${id}`);
    const user = await this.users.findOneBy({ id });
    if (!user) {
      this.logger.warn(`User with ID ${id} not found`);
      return null;
    }

    const publicUser = this.toPublicUser(user);
    await this.cache.set(key, publicUser);
    return publicUser;
  }

  private toPublicUser(user: UserEntity): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
