export class FindAllOrdersQuery {
  constructor(public readonly userId?: string) {}
}

export class FindOneOrderQuery {
  constructor(
    public readonly id: string,
    public readonly userId?: string,
  ) {}
}
