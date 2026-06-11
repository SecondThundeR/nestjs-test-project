import { Module } from '@nestjs/common';
import { ConfigModule, ConfigType } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCacheModule } from '@app/cache';
import { buildDatabaseOptions, cacheConfig, validateEnv } from '@app/config';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';
import { UserEntity } from './entities/user.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [cacheConfig],
      validate: validateEnv,
    }),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: ConfigType<typeof cacheConfig>) => ({
        namespace: 'users',
        ttl: cache.usersCacheTtl,
        redis: cache.redis,
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDatabaseOptions('USERS', [UserEntity]),
    }),
    TypeOrmModule.forFeature([UserEntity]),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
