import { ApiProperty } from '@nestjs/swagger';

export class ProductResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: 'Logitech PRO X2 SUPERSTRIKE' })
  name!: string;

  @ApiProperty({
    example:
      'PRO X2 SUPERSTRIKE is a breakthrough in ultra-low click-latency technology',
  })
  description!: string;

  @ApiProperty({ example: 179.99 })
  price!: number;

  @ApiProperty({ example: 50 })
  stock!: number;

  @ApiProperty({ format: 'date-time' })
  createdAt!: string;

  @ApiProperty({ format: 'date-time' })
  updatedAt!: string;
}

export class ProductDeleteResponse {
  @ApiProperty({ format: 'uuid' })
  id!: string;

  @ApiProperty({ example: true })
  deleted!: boolean;
}
