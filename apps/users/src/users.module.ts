import { Module } from '@nestjs/common';
import { JwtModule, type JwtSignOptions } from '@nestjs/jwt';
import { JWT_CONFIG } from '@app/contracts';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [
    JwtModule.register({
      secret: JWT_CONFIG.secret,
      signOptions: {
        expiresIn: JWT_CONFIG.expiresIn as JwtSignOptions['expiresIn'],
      },
    }),
  ],
  controllers: [UsersController],
  providers: [UsersService],
})
export class UsersModule {}
