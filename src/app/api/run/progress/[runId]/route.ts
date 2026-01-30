import { NextRequest } from 'next/server';
import { progressStore } from '@/lib/progress/progressStore';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * SSE endpoint for real-time run progress updates
 * Connects to EventSource from the client
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ runId: string }> }
): Promise<Response> {
  const { runId } = await params;

  // Set up SSE headers
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      // Send initial connection message
      controller.enqueue(
        encoder.encode(`data: ${JSON.stringify({ type: 'connected', runId }) }\n\n`)
      );

      // Check initial state
      const initialProgress = progressStore.getProgress(runId);
      if (initialProgress) {
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'progress', data: initialProgress })}\n\n`
          )
        );
      }

      // Poll progress every 500ms
      const interval = setInterval(() => {
        const progress = progressStore.getProgress(runId);

        if (!progress) {
          // Run not found - might be cleaned up or never started
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: 'notfound',
                message: 'Run not found or has expired',
              })}\n\n`
            )
          );
          clearInterval(interval);
          controller.close();
          return;
        }

        // Send progress update
        controller.enqueue(
          encoder.encode(
            `data: ${JSON.stringify({ type: 'progress', data: progress })}\n\n`
          )
        );

        // Close on completion or error
        if (progress.currentPhase === 'complete' || progress.currentPhase === 'error') {
          // Send one final update before closing
          controller.enqueue(
            encoder.encode(
              `data: ${JSON.stringify({
                type: progress.currentPhase,
                data: progress,
              })}\n\n`
            )
          );
          clearInterval(interval);
          controller.close();
        }
      }, 500);

      // Cleanup on client disconnect
      request.signal.addEventListener('abort', () => {
        clearInterval(interval);
        controller.close();
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
    },
  });
}
