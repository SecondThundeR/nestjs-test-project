import { CacheService } from '@app/cache';
import {
  ValidateUserByCredentialsDto,
  type PublicUser,
  CreateUserDto,
} from '@app/domains';
import { RpcErrors } from '@app/filters';
import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { randomUUID } from 'node:crypto';
import { Repository } from 'typeorm';
import { hash, compare } from 'bcrypt';
import { UserEntity } from './entities/user.entity';

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
      this.logger.warn(`Create rejected: ${email} already exist`);
      throw RpcErrors.conflict(`Email ${dto.email} is already exist`);
    }

    const user = await this.users.save(
      this.users.create({
        id: randomUUID(),
        email,
        name: dto.name,
        passwordHash: await hash(dto.password, SALT_ROUNDS),
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
    return this.cache.wrap(userCacheKey(id), async () => {
      this.logger.log(`Trying to get user with ID ${id}`);
      const user = await this.users.findOneBy({ id });

      if (!user) {
        this.logger.warn(`User with ID ${id} not found`);
        return null;
      }

      return this.toPublicUser(user);
    });
  }

  private toPublicUser(user: UserEntity): PublicUser {
    const { passwordHash: _passwordHash, ...publicUser } = user;
    return publicUser;
  }
}
