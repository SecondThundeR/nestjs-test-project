import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { buildDatabaseOptions, servicesConfig, validateEnv } from '@app/config';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';
import { ProductEntity } from './entities/product.entity';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig],
      validate: validateEnv,
    }),
    TypeOrmModule.forRootAsync({
      useFactory: () => buildDatabaseOptions('PRODUCTS', [ProductEntity]),
    }),
    TypeOrmModule.forFeature([ProductEntity]),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
