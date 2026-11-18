import type { IncomingMessage, ServerResponse } from 'node:http';
import type {
  IslandStatusPayload,
  ServerEvent,
  ServerEventType,
} from '../../shared/types.ts';

const INITIAL_ISLAND_STATE: IslandStatusPayload = {
  state: 'idle',
  mood: 'contento',
  statusText: 'Reposo',
  peekCard: null,
};

export class EventBus {
  private islandState: IslandStatusPayload;
  private readonly subscribers: Set<(event: ServerEvent) => void>;
  private readonly sseClients: Set<ServerResponse>;
  private seq: number;

  constructor() {
    this.islandState = { ...INITIAL_ISLAND_STATE };
    this.subscribers = new Set();
    this.sseClients = new Set();
    this.seq = 0;
  }

  getIslandState(): IslandStatusPayload {
    return structuredClone(this.islandState);
  }

  setIslandState(next: Partial<IslandStatusPayload>): IslandStatusPayload {
    const nextState = next.state ?? this.islandState.state;
    const stateChanged = next.state !== undefined && next.state !== this.islandState.state;

    const merged: IslandStatusPayload = {
      state: nextState,
      mood: next.mood ?? this.islandState.mood,
      statusText: next.statusText ?? this.islandState.statusText,
      peekCard:
        next.peekCard !== undefined
          ? next.peekCard
          : stateChanged && nextState === 'idle'
          ? null
          : (this.islandState.peekCard ?? null),
    };

    const badgeWord =
      'badgeWord' in next
        ? next.badgeWord
        : !stateChanged && nextState === 'success'
        ? this.islandState.badgeWord
        : undefined;
    if (badgeWord !== undefined) {
      merged.badgeWord = badgeWord;
    }

    const focusRemainingSec =
      'focusRemainingSec' in next
        ? next.focusRemainingSec
        : !stateChanged && nextState === 'focus'
        ? this.islandState.focusRemainingSec
        : undefined;
    if (focusRemainingSec !== undefined) {
      merged.focusRemainingSec = focusRemainingSec;
    }

    const remindMessage =
      'remindMessage' in next
        ? next.remindMessage
        : !stateChanged && nextState === 'remind'
        ? this.islandState.remindMessage
        : undefined;
    if (remindMessage !== undefined) {
      merged.remindMessage = remindMessage;
    }

    const transcript =
      'transcript' in next
        ? next.transcript
        : !stateChanged && nextState === 'listen'
        ? this.islandState.transcript
        : undefined;
    if (transcript !== undefined) {
      merged.transcript = transcript;
    }

    this.islandState = merged;
    const snapshot = this.getIslandState();
    this.publish('island.state', snapshot);
    return snapshot;
  }

  resetIslandState(): IslandStatusPayload {
    this.islandState = { ...INITIAL_ISLAND_STATE };
    const snapshot = this.getIslandState();
    this.publish('island.state', snapshot);
    return snapshot;
  }

  publish<T>(type: ServerEventType, payload: T): ServerEvent<T> {
    const event: ServerEvent<T> = {
      type,
      payload,
      ts: new Date().toISOString(),
    };
    for (const listener of this.subscribers) {
      try {
        listener(event);
      } catch {
        // Isolate subscriber errors so remaining listeners still receive events
      }
    }
    return event;
  }

  subscribe(listener: (event: ServerEvent) => void): () => void {
    this.subscribers.add(listener);
    let removed = false;
    return () => {
      if (removed) return;
      removed = true;
      this.subscribers.delete(listener);
    };
  }

  attachSseResponse(req: IncomingMessage, res: ServerResponse): void {
    res.writeHead(200, {
      'Content-Type': 'text/event-stream; charset=utf-8',
      'Cache-Control': 'no-cache, no-transform',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
      'Access-Control-Allow-Origin': '*',
    });
    res.flushHeaders?.();
    res.write('retry: 3000\n\n');

    this.sseClients.add(res);

    const writeEvent = (event: ServerEvent): void => {
      if (res.writableEnded || res.destroyed) return;
      this.seq += 1;
      res.write(`id: ${this.seq}\ndata: ${JSON.stringify(event)}\n\n`);
    };

    writeEvent({
      type: 'island.state',
      payload: this.getIslandState(),
      ts: new Date().toISOString(),
    });

    const unsubscribe = this.subscribe(writeEvent);

    let cleaned = false;
    const cleanup = (): void => {
      if (cleaned) return;
      cleaned = true;
      unsubscribe();
      this.sseClients.delete(res);
    };

    req.on('close', cleanup);
    res.on('close', cleanup);
    res.on('error', cleanup);
  }

  sendHeartbeat(): void {
    for (const res of this.sseClients) {
      if (res.writableEnded || res.destroyed) {
        this.sseClients.delete(res);
        continue;
      }
      try {
        res.write(': ping\n\n');
      } catch {
        this.sseClients.delete(res);
      }
    }
  }

  get subscriberCount(): number {
    return this.subscribers.size;
  }

  get clientCount(): number {
    return this.sseClients.size;
  }

  close(): void {
    for (const res of this.sseClients) {
      try {
        if (!res.writableEnded && !res.destroyed) {
          res.end();
        }
      } catch {
        // Ignore stream close errors during shutdown
      }
    }
    this.sseClients.clear();
    this.subscribers.clear();
  }
}
