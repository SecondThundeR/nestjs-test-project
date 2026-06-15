import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class UpdateProductDto {
  @ApiPropertyOptional({ example: 'Logitech PRO X2 SUPERSTRIKE', minLength: 2 })
  @IsString()
  @IsOptional()
  @MinLength(2)
  name?: string;

  @ApiPropertyOptional({
    example:
      'PRO X2 SUPERSTRIKE is a breakthrough in ultra-low click-latency technology',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiPropertyOptional({ example: 179.99, minimum: 0 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @IsOptional()
  price?: number;

  @ApiPropertyOptional({ example: 50, minimum: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;
}

export interface UpdateProductPayload {
  id: string;
  data: UpdateProductDto;
}
