import { IsInt, IsString, Min, MinLength } from 'class-validator';

export class AddCartItemDto {
  @IsString()
  @MinLength(1)
  productId!: string;

  @IsInt()
  @Min(1)
  quantity!: number;
}

export class UpdateCartItemDto {
  @IsInt()
  @Min(0)
  quantity!: number;
}

export interface AddCartItemPayload {
  userId: string;
  item: AddCartItemDto;
}

export interface UpdateCartItemPayload {
  userId: string;
  productId: string;
  quantity: number;
}

export interface RemoveCartItemPayload {
  userId: string;
  productId: string;
}
