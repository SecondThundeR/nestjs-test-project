import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { servicesConfig, validateEnv } from '@app/contracts';
import { ProductsController } from './products.controller';
import { ProductsService } from './products.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [servicesConfig],
      validate: validateEnv,
    }),
  ],
  controllers: [ProductsController],
  providers: [ProductsService],
})
export class ProductsModule {}
