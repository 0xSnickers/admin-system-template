import { Module } from '@nestjs/common';
import { TokenModule } from '../auth/token.module';
import { ErrorsController } from './errors.controller';
import { ErrorsRepository } from './errors.repository';
import { ErrorsService } from './errors.service';

@Module({
  imports: [TokenModule],
  controllers: [ErrorsController],
  providers: [ErrorsService, ErrorsRepository],
  exports: [ErrorsService],
})
export class ErrorsModule {}
