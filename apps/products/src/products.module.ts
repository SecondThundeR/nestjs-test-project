import { AppCacheModule } from '@app/cache';
import {
  buildDatabaseOptions,
  type CacheConfig,
  cacheConfig,
  validateEnv,
} from '@app/config';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { CqrsModule } from '@nestjs/cqrs';
import { TypeOrmModule } from '@nestjs/typeorm';

import { productsHandlers } from './cqrs/handlers';
import { ProductEntity } from './entities/product.entity';
import { productsMigrations } from './migrations';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [cacheConfig],
      validate: validateEnv,
    }),
    CqrsModule.forRoot(),
    AppCacheModule.registerAsync({
      inject: [cacheConfig.KEY],
      useFactory: (cache: CacheConfig) => ({
        namespace: 'products',
        ttl: cache.productsCacheTtl,
        redis: cache.redis,
      }),
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () =>
        buildDatabaseOptions('PRODUCTS', [ProductEntity], productsMigrations),
    }),
    TypeOrmModule.forFeature([ProductEntity]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService, ...productsHandlers],
})
export class ProductsModule {}
