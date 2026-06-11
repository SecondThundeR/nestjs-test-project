import {
  CacheModule as NestCacheModule,
  type CacheManagerOptions,
} from '@nestjs/cache-manager';
import {
  Global,
  Module,
  type DynamicModule,
  type FactoryProvider,
  type ModuleMetadata,
} from '@nestjs/common';
import {
  buildCacheManagerOptions,
  type AppCacheOptions,
} from './cache.options';
import { CacheService } from './cache.service';

export interface AppCacheAsyncOptions extends Pick<ModuleMetadata, 'imports'> {
  inject?: FactoryProvider['inject'];
  useFactory: (...args: any[]) => Promise<AppCacheOptions> | AppCacheOptions;
}

@Global()
@Module({})
export class AppCacheModule {
  static register(options: AppCacheOptions): DynamicModule {
    return this.build({
      useFactory: () => buildCacheManagerOptions(options),
    });
  }

  static registerAsync(options: AppCacheAsyncOptions): DynamicModule {
    return this.build({
      imports: options.imports,
      inject: options.inject,
      useFactory: async (...args) =>
        // eslint-disable-next-line @typescript-eslint/no-unsafe-argument
        buildCacheManagerOptions(await options.useFactory(...args)),
    });
  }

  private static build(options: {
    imports?: ModuleMetadata['imports'];
    inject?: FactoryProvider['inject'];
    useFactory: (
      ...args: any[]
    ) => CacheManagerOptions | Promise<CacheManagerOptions>;
  }): DynamicModule {
    return {
      module: AppCacheModule,
      imports: [
        NestCacheModule.registerAsync({
          imports: options.imports,
          inject: options.inject,
          useFactory: options.useFactory,
        }),
      ],
      providers: [CacheService],
      exports: [CacheService],
    };
  }
}
