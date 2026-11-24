import { Body, Controller, Delete, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { isIP } from 'node:net';
import { AppException } from '../../common/http/app.exception';
import { UuidPipe } from '../../common/http/pipes';
import { RangeQueryDto } from '../../common/monitor/range';
import { AuthGuard, Roles } from '../auth/auth.guard';
import { CreateIpRuleDto, IpQueryDto } from './ip.dto';
import { IpsService } from './ips.service';

@Controller('v1')
@UseGuards(AuthGuard)
export class IpsController {
  constructor(private readonly ips: IpsService) {}

  @Get('ips')
  list(@Query() query: IpQueryDto) {
    return this.ips.list(query);
  }

  @Get('ips/:ip')
  detail(@Param('ip') ip: string, @Query() query: RangeQueryDto) {
    if (!isIP(ip)) throw AppException.validation({ ip: ['must be a valid IP address'] });
    return this.ips.detail(ip, query);
  }

  @Get('ip-rules')
  rules() {
    return this.ips.rules();
  }

  @Post('ip-rules')
  @Roles('admin')
  block(@Body() dto: CreateIpRuleDto) {
    return this.ips.block(dto);
  }

  @Delete('ip-rules/:id')
  @Roles('admin')
  unblock(@Param('id', UuidPipe) id: string) {
    return this.ips.unblock(id);
  }
}
