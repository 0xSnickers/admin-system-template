import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { IpsController } from './ips.controller';
import { IpsRepository } from './ips.repository';
import { IpsService } from './ips.service';

@Module({
  imports: [TokenModule],
  controllers: [IpsController],
  providers: [IpsService, IpsRepository],
  exports: [IpsService],
})
export class IpsModule {}
