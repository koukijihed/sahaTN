import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { SessionAuthGuard } from '../../common/guards/session-auth.guard';
import { RolesGuard } from '../../common/guards/roles.guard';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { PasswordService } from './password.service';
import { SessionService } from './session.service';

@Module({
  imports: [ConfigModule],
  controllers: [AuthController],
  providers: [
    AuthService,
    PasswordService,
    SessionService,
    SessionAuthGuard,
    RolesGuard
  ],
  exports: [
    AuthService,
    SessionService,
    SessionAuthGuard,
    RolesGuard
  ]
})
export class AuthModule {}
