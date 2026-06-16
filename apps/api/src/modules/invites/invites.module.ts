import { Module } from '@nestjs/common';
import {
  InstitutionInvitesController,
  InvitesController,
} from './invites.controller';
import { InvitesService } from './invites.service';

@Module({
  controllers: [InstitutionInvitesController, InvitesController],
  providers: [InvitesService],
  exports: [InvitesService],
})
export class InvitesModule {}
