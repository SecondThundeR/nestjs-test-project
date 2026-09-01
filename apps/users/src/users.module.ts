import { AppCacheModule } from '@app/cache';
import {
  buildDatabaseOptions,
  type CacheConfig,
  cacheConfig,
  environmentSchema,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';

import { UserEntity } from './entities/user.entity.js';
import { usersMigrations } from './migrations/index.js';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [cacheConfig],
      validationSchema: environmentSchema,
    }),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: CacheConfig) => ({
        namespace: 'users',
        ttl: cache.usersCacheTtl,
        redis: cache.redis,
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('USERS', [UserEntity], usersMigrations),
    }),
    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
