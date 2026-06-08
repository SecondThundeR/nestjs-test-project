import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';

export const UserId = createParamDecorator(
  (_: unknown, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<Request>();
    const header = request.header('x-user-id');
    return header && header.trim().length > 0 ? header.trim() : 'demo-user';
  },
);
