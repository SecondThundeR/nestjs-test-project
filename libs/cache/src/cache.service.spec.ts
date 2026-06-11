import type { Cache } from 'cache-manager';
import { CacheService } from './cache.service';

describe('CacheService', () => {
  let cache: jest.Mocked<Pick<Cache, 'get' | 'set' | 'del'>>;
  let service: CacheService;

  beforeEach(() => {
    cache = {
      get: jest.fn(),
      set: jest.fn().mockResolvedValue(undefined),
      del: jest.fn().mockResolvedValue(true),
    };
    service = new CacheService(cache as unknown as Cache);
  });

  describe('get', () => {
    it('returns the stored value on a hit', async () => {
      cache.get.mockResolvedValue('value');

      await expect(service.get('key')).resolves.toBe('value');
    });

    it('returns undefined on a miss', async () => {
      cache.get.mockResolvedValue(null);

      await expect(service.get('key')).resolves.toBeUndefined();
    });

    it('returns undefined when the backend throws', async () => {
      cache.get.mockRejectedValue(new Error('redis down'));

      await expect(service.get('key')).resolves.toBeUndefined();
    });
  });

  describe('set', () => {
    it('forwards the key, value and ttl to the backend', async () => {
      await service.set('key', 'value', 1000);

      expect(cache.set).toHaveBeenCalledWith('key', 'value', 1000);
    });

    it('swallows backend failures', async () => {
      cache.set.mockRejectedValue(new Error('redis down'));

      await expect(service.set('key', 'value')).resolves.toBeUndefined();
    });
  });

  describe('del', () => {
    it('evicts each key in a list', async () => {
      await service.del(['a', 'b']);

      expect(cache.del).toHaveBeenCalledWith('a');
      expect(cache.del).toHaveBeenCalledWith('b');
    });

    it('does nothing for an empty list', async () => {
      await service.del([]);

      expect(cache.del).not.toHaveBeenCalled();
    });

    it('swallows backend failures', async () => {
      cache.del.mockRejectedValue(new Error('redis down'));

      await expect(service.del('key')).resolves.toBeUndefined();
    });
  });

  describe('wrap', () => {
    it('caches the factory result on a miss', async () => {
      cache.get.mockResolvedValue(undefined);
      const factory = jest.fn().mockResolvedValue('computed');

      await expect(service.wrap('key', factory, 500)).resolves.toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
      expect(cache.set).toHaveBeenCalledWith('key', 'computed', 500);
    });

    it('returns the cached value without calling the factory on a hit', async () => {
      cache.get.mockResolvedValue('cached');
      const factory = jest.fn();

      await expect(service.wrap('key', factory)).resolves.toBe('cached');
      expect(factory).not.toHaveBeenCalled();
    });

    it('still runs the factory when the cache backend fails', async () => {
      cache.get.mockRejectedValue(new Error('redis down'));
      cache.set.mockRejectedValue(new Error('redis down'));
      const factory = jest.fn().mockResolvedValue('computed');

      await expect(service.wrap('key', factory)).resolves.toBe('computed');
      expect(factory).toHaveBeenCalledTimes(1);
    });

    it('does not swallow factory errors', async () => {
      cache.get.mockResolvedValue(undefined);
      const factory = jest.fn().mockRejectedValue(new Error('not found'));

      await expect(service.wrap('key', factory)).rejects.toThrow('not found');
      expect(cache.set).not.toHaveBeenCalled();
    });
  });
});
