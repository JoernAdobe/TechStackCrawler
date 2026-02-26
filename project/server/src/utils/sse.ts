import type { Response } from 'express';
import type { AnalysisResult, ProgressEvent } from '../types/analysis.js';

export class SSEWriter {
  private closed = false;

  constructor(private res: Response) {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.flushHeaders();
  }

  private flush() {
    if (typeof (this.res as unknown as { flush?: () => void }).flush === 'function') {
      (this.res as unknown as { flush: () => void }).flush();
    }
  }

  sendProgress(
    phase: ProgressEvent['phase'],
    message: string,
    data?: Record<string, unknown>,
  ) {
    if (this.closed) return;
    const event: ProgressEvent = { phase, message, data, timestamp: Date.now() };
    this.res.write(`event: progress\ndata: ${JSON.stringify(event)}\n\n`);
    this.flush();
  }

  sendResult(result: AnalysisResult) {
    if (this.closed) return;
    this.res.write(`event: result\ndata: ${JSON.stringify(result)}\n\n`);
    this.flush();
  }

  sendError(message: string) {
    if (this.closed) return;
    this.res.write(
      `event: error\ndata: ${JSON.stringify({ message, timestamp: Date.now() })}\n\n`,
    );
    this.flush();
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    this.res.end();
  }
}
