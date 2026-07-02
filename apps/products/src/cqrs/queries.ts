export class FindAllProductsQuery {}

export class FindOneProductQuery {
  constructor(public readonly id: string) {}
}

export class FindManyProductsQuery {
  constructor(public readonly ids: string[]) {}
}
