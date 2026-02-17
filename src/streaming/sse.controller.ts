import { Controller, Param, Sse } from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';
import { LogStreamService, LogStreamEvent } from './log-stream.service';

@Controller('stream')
export class SSEController {
  constructor(private readonly logStream: LogStreamService) {}

  /**
   * SSE endpoint for real-time logs of a job.
   * GET /stream/logs/:jobId - clients receive log lines as they are appended.
   */
  @Sse('logs/:jobId')
  streamJobLogs(@Param('jobId') jobId: string): Observable<{ data: LogStreamEvent }> {
    return this.logStream.getLogStreamForJob(jobId).pipe(map((ev) => ({ data: ev })));
  }

  /**
   * SSE endpoint for all log events (all jobs). Useful for a global dashboard.
   */
  @Sse('logs')
  streamAllLogs(): Observable<{ data: LogStreamEvent }> {
    return this.logStream.getLogStream().pipe(map((ev) => ({ data: ev })));
  }
}
