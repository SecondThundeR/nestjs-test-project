import { CACHE_MANAGER } from '@nestjs/cache-manager';
import { Inject, Injectable, Logger } from '@nestjs/common';
import type { Cache } from 'cache-manager';

function describeError(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

@Injectable()
export class CacheService {
  private readonly logger = new Logger(CacheService.name);

  constructor(@Inject(CACHE_MANAGER) private readonly cache: Cache) {}

  async get<T>(key: string): Promise<T | undefined> {
    try {
      const value = await this.cache.get<T>(key);
      this.logger.debug(
        value === undefined || value === null
          ? `Cache miss for "${key}"`
          : `Cache hit for "${key}"`,
      );
      return value ?? undefined;
    } catch (error) {
      this.logger.warn(
        `Cache get failed for "${key}": ${describeError(error)}`,
      );
      return undefined;
    }
  }

  async set<T>(key: string, value: T, ttl?: number): Promise<void> {
    try {
      await this.cache.set(key, value, ttl);
      this.logger.debug(`Cached "${key}"`);
    } catch (error) {
      this.logger.warn(
        `Cache set failed for "${key}": ${describeError(error)}`,
      );
    }
  }

  async del(keys: string | string[]): Promise<void> {
    const list = Array.isArray(keys) ? keys : [keys];
    if (!list.length) {
      return;
    }

    try {
      await Promise.all(list.map((key) => this.cache.del(key)));
      this.logger.debug(`Evicted ${list.length} cache key(s)`);
    } catch (error) {
      this.logger.warn(`Cache eviction failed: ${describeError(error)}`);
    }
  }

  async wrap<T>(
    key: string,
    factory: () => Promise<T>,
    ttl?: number,
  ): Promise<T> {
    const cached = await this.get<T>(key);
    if (cached !== undefined) {
      return cached;
    }

    const value = await factory();
    await this.set(key, value, ttl);
    return value;
  }
}
