import { Logger } from '@nestjs/common';
import { WinstonModule } from 'nest-winston';
import { afterEach, expect, it, vi } from 'vitest';
import { transports } from 'winston';
import { createWinstonLogger } from './winston.logger.js';

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

function renderLog(level: string | undefined, format: string | undefined) {
  vi.stubEnv('LOG_LEVEL', level);
  vi.stubEnv('LOG_FORMAT', format);
  const logger = new Logger('fixture');
  const createLogger = vi
    .spyOn(WinstonModule, 'createLogger')
    .mockReturnValue(logger);
  expect(createWinstonLogger('Products')).toBe(logger);
  const [options] = createLogger.mock.calls[0];
  expect(options.transports).toEqual([expect.any(transports.Console)]);
  const [transport] =
    options.transports as transports.ConsoleTransportInstance[];
  const defaultMeta = options.defaultMeta as
    Record<string, unknown> | undefined;
  const output = transport.format!.transform(
    { ...defaultMeta, level: 'info', message: 'ready' },
    {},
  );
  const rendered = (output as Record<symbol, string>)[Symbol.for('message')];
  return { rendered, level: options.level, defaultMeta };
}

it.each([
  [undefined, undefined],
  ['INVALID', 'pretty'],
] as const)(
  'uses pretty output and info level for %s and %s',
  (level, format) => {
    const result = renderLog(level, format);
    expect(result.level).toBe('info');
    expect(result.defaultMeta).toBeUndefined();
    expect(result.rendered).toContain('[Products]');
    expect(result.rendered).toContain('ready');
  },
);

it('normalizes explicit log settings and emits structured metadata', () => {
  const result = renderLog('DEBUG', 'JSON');
  expect(result.level).toBe('debug');
  expect(JSON.parse(result.rendered)).toMatchObject({
    service: 'Products',
    level: 'info',
    message: 'ready',
  });
});
