import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Logitech PRO X2 SUPERSTRIKE', minLength: 2 })
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiPropertyOptional({
    example:
      'PRO X2 SUPERSTRIKE is a breakthrough in ultra-low click-latency technology',
  })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({
    example: 179.99,
    minimum: 0,
    description: 'Price per unit (USD)',
  })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price!: number;

  @ApiPropertyOptional({ example: 50, minimum: 0, default: 0 })
  @IsInt()
  @Min(0)
  @IsOptional()
  stock?: number;
}
