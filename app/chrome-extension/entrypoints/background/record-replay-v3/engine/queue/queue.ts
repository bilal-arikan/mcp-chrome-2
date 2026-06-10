/**
 * @fileoverview RunQueue interface definitions
 * @description Defines the management interface for the Run queue
 */

import type { JsonObject, UnixMillis } from '../../domain/json';
import type { FlowId, NodeId, RunId } from '../../domain/ids';
import type { TriggerFireContext } from '../../domain/triggers';

/**
 * RunQueue configuration
 */
export interface RunQueueConfig {
  /** Maximum number of parallel Runs */
  maxParallelRuns: number;
  /** Lease TTL (milliseconds) */
  leaseTtlMs: number;
  /** Heartbeat interval (milliseconds) */
  heartbeatIntervalMs: number;
}

/**
 * Default queue configuration
 */
export const DEFAULT_QUEUE_CONFIG: RunQueueConfig = {
  maxParallelRuns: 3,
  leaseTtlMs: 15_000,
  heartbeatIntervalMs: 5_000,
};

/**
 * Queue item status
 */
export type QueueItemStatus = 'queued' | 'running' | 'paused';

/**
 * Lease information
 */
export interface Lease {
  /** Owner ID */
  ownerId: string;
  /** Expiration time */
  expiresAt: UnixMillis;
}

/**
 * RunQueue item
 */
export interface RunQueueItem {
  /** Run ID */
  id: RunId;
  /** Flow ID */
  flowId: FlowId;
  /** Status */
  status: QueueItemStatus;
  /** Creation time */
  createdAt: UnixMillis;
  /** Update time */
  updatedAt: UnixMillis;
  /** Priority (higher number means higher priority) */
  priority: number;
  /** Current attempt count */
  attempt: number;
  /** Maximum attempt count */
  maxAttempts: number;
  /** Tab ID */
  tabId?: number;
  /** Run arguments */
  args?: JsonObject;
  /** Trigger context */
  trigger?: TriggerFireContext;
  /** Lease information */
  lease?: Lease;
  /** Debug configuration */
  debug?: { breakpoints?: NodeId[]; pauseOnStart?: boolean };
}

/**
 * Enqueue request (excluding auto-generated fields)
 * - priority defaults to 0
 * - maxAttempts defaults to 1
 */
export type EnqueueInput = Omit<
  RunQueueItem,
  'status' | 'createdAt' | 'updatedAt' | 'attempt' | 'lease' | 'priority' | 'maxAttempts'
> & {
  id: RunId;
  /** Priority (higher number means higher priority, defaults to 0) */
  priority?: number;
  /** Maximum attempt count (defaults to 1) */
  maxAttempts?: number;
};

/**
 * RunQueue interface
 * @description Manages Run queueing and scheduling
 */
export interface RunQueue {
  /**
   * Enqueue
   * @param input Enqueue request
   * @returns Queue item
   */
  enqueue(input: EnqueueInput): Promise<RunQueueItem>;

  /**
   * Claim the next executable Run
   * @param ownerId Claimer ID
   * @param now Current time
   * @returns Queue item or null
   */
  claimNext(ownerId: string, now: UnixMillis): Promise<RunQueueItem | null>;

  /**
   * Renew lease heartbeat
   * @param ownerId Claimer ID
   * @param now Current time
   */
  heartbeat(ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Reclaim expired leases
   * @description Reclaims running/paused items with lease.expiresAt < now back to queued
   * @param now Current time
   * @returns List of reclaimed Run IDs
   */
  reclaimExpiredLeases(now: UnixMillis): Promise<RunId[]>;

  /**
   * Recover orphan leases (called after SW restart)
   * @description
   * - Reclaims orphan running items back to queued (status -> queued, lease cleared)
   * - Adopts orphan paused items (keeps status=paused, lease ownerId updated to new ownerId)
   * @param ownerId New ownerId (current Service Worker instance)
   * @param now Current time
   * @returns List of affected runIds (includes original ownerId for auditing)
   */
  recoverOrphanLeases(
    ownerId: string,
    now: UnixMillis,
  ): Promise<{
    requeuedRunning: Array<{ runId: RunId; prevOwnerId?: string }>;
    adoptedPaused: Array<{ runId: RunId; prevOwnerId?: string }>;
  }>;

  /**
   * Mark as running
   */
  markRunning(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Mark as paused
   */
  markPaused(runId: RunId, ownerId: string, now: UnixMillis): Promise<void>;

  /**
   * Mark as done (remove from queue)
   */
  markDone(runId: RunId, now: UnixMillis): Promise<void>;

  /**
   * Cancel Run
   */
  cancel(runId: RunId, now: UnixMillis, reason?: string): Promise<void>;

  /**
   * Get queue item
   */
  get(runId: RunId): Promise<RunQueueItem | null>;

  /**
   * List queue items
   */
  list(status?: QueueItemStatus): Promise<RunQueueItem[]>;
}

/**
 * Create a NotImplemented RunQueue
 * @description Phase 0 placeholder implementation
 */
export function createNotImplementedQueue(): RunQueue {
  const notImplemented = () => {
    throw new Error('RunQueue not implemented');
  };

  return {
    enqueue: async () => notImplemented(),
    claimNext: async () => notImplemented(),
    heartbeat: async () => notImplemented(),
    reclaimExpiredLeases: async () => notImplemented(),
    recoverOrphanLeases: async () => notImplemented(),
    markRunning: async () => notImplemented(),
    markPaused: async () => notImplemented(),
    markDone: async () => notImplemented(),
    cancel: async () => notImplemented(),
    get: async () => notImplemented(),
    list: async () => notImplemented(),
  };
}
