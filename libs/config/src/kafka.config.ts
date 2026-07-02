import type { ConfigType } from '@nestjs/config';
import { registerAs } from '@nestjs/config';

export const KAFKA_CLIENT = 'KAFKA_CLIENT';

export const kafkaConfig = registerAs('kafka', () => ({
  brokers: (process.env.KAFKA_BROKERS ?? 'localhost:9094')
    .split(',')
    .map((broker) => broker.trim())
    .filter(Boolean),
}));

export type KafkaConfig = ConfigType<typeof kafkaConfig>;
