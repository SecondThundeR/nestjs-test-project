import { plainToInstance, Type } from 'class-transformer';
import {
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Max,
  Min,
  validateSync,
} from 'class-validator';

class EnvironmentVariables {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  LOG_LEVEL?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  LOG_FORMAT?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  JWT_SECRET?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  JWT_EXPIRES_IN?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  REFRESH_TTL_DAYS?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  GATEWAY_PORT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  PRODUCTS_PORT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  CART_PORT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  ORDERS_PORT?: number;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  USERS_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PRODUCTS_HOST?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CART_HOST?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ORDERS_HOST?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  USERS_HOST?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  DB_SYNCHRONIZE?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PRODUCTS_DB_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  PRODUCTS_DB_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PRODUCTS_DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PRODUCTS_DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  PRODUCTS_DB_NAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CART_DB_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  CART_DB_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CART_DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CART_DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  CART_DB_NAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ORDERS_DB_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  ORDERS_DB_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ORDERS_DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ORDERS_DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  ORDERS_DB_NAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  USERS_DB_HOST?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(65535)
  USERS_DB_PORT?: number;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  USERS_DB_USERNAME?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  USERS_DB_PASSWORD?: string;

  @IsOptional()
  @IsString()
  @IsNotEmpty()
  USERS_DB_NAME?: string;
}

export function validateEnv(
  config: Record<string, unknown>,
): EnvironmentVariables {
  const validated = plainToInstance(EnvironmentVariables, config, {
    enableImplicitConversion: true,
  });

  const errors = validateSync(validated, { skipMissingProperties: false });
  if (errors.length > 0) {
    throw new Error(errors.map((error) => error.toString()).join('\n'));
  }

  return validated;
}
