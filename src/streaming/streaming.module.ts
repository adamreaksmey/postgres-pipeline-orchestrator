import { Module } from '@nestjs/common';
import { LogStreamService } from './log-stream.service';
import { SSEController } from './sse.controller';

@Module({
  controllers: [SSEController],
  providers: [LogStreamService],
  exports: [LogStreamService],
})
export class StreamingModule {}
