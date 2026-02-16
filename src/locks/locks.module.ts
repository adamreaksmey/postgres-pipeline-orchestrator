import { Module } from '@nestjs/common';
import { DeploymentLockService } from './deployment-lock.service';

@Module({
  providers: [DeploymentLockService],
  exports: [DeploymentLockService],
})
export class LocksModule {}
