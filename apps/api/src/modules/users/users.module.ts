import { Module } from '@nestjs/common';
import { InvitesModule } from '../invites/invites.module';
import { UsersController } from './users.controller';
import { UsersService } from './users.service';

@Module({
  imports: [InvitesModule],
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
