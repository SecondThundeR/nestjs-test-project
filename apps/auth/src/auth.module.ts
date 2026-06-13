import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { ClientsModule, Transport } from '@nestjs/microservices';
import { ScheduleModule } from '@nestjs/schedule';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AppCacheModule } from '@app/cache';
import {
  type AuthConfig,
  authConfig,
  buildDatabaseOptions,
  type CacheConfig,
  cacheConfig,
  SERVICE_NAMES,
  type ServicesConfig,
  servicesConfig,
  validateEnv,
} from '@app/config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { SessionEntity } from './entities/session.entity';
import { authMigrations } from './migrations';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [authConfig, servicesConfig, cacheConfig],
      validate: validateEnv,
    }),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: CacheConfig) => ({
        namespace: 'auth',
        ttl: cache.authCacheTtl,
        redis: cache.redis,
      }),
    }),
    ScheduleModule.forRoot(),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('AUTH', [SessionEntity], authMigrations),
    }),
    TypeOrmModule.forFeature([SessionEntity]),
    JwtModule.registerAsync({
      inject: [authConfig.KEY],
      useFactory: (auth: AuthConfig) => ({
        secret: auth.secret,
        signOptions: {
          expiresIn: auth.expiresIn as JwtSignOptions['expiresIn'],
        },
      }),
    }),
    ClientsModule.registerAsync([
      {
        name: SERVICE_NAMES.USERS,
        inject: [servicesConfig.KEY],
        useFactory: (services: ServicesConfig) => ({
          transport: Transport.TCP,
          options: { host: services.hosts.users, port: services.ports.users },
        }),
      },
    ]),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AuthModule {}
