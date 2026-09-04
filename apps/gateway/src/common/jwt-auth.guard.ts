import type { JwtPayload } from '@app/domains';
import { Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

export type AuthenticatedRequest = Request & { user: JwtPayload };

@Injectable()
export class JwtAuthGuard extends AuthGuard('jwt') {}
