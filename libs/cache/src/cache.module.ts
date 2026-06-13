import { CacheModule as NestCacheModule } from '@nestjs/cache-manager';
import {
  type DynamicModule,
  type FactoryProvider,
  Global,
  Module,
  type ModuleMetadata,
} from '@nestjs/common';

import {
  type AppCacheOptions,
  buildCacheManagerOptions,
} from './cache.options';
import { CacheService } from './cache.service';

export interface AppCacheAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...args: any[]) => Promise<AppCacheOptions> | AppCacheOptions;
}

@Global()
@Module({})
export class AppCacheModule {
  static registerAsync(options: AppCacheAsyncOptions): DynamicModule {
    return {
      module: AppCacheModule,
      imports: [
        NestCacheModule.registerAsync({
          imports: options.imports,
          inject: options.inject,
          useFactory: async (...args) =>
            // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
            buildCacheManagerOptions(await options.useFactory(...args)),
        }),
      ],
      providers: [CacheService],
      exports: [CacheService],
    };
  }
}
