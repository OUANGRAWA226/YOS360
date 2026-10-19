import { supabase } from '@/lib/supabase';

// Offline storage: IndexedDB cache of all app data + a mutation queue that
// replays when connectivity returns. Table "mouvements" gets server-side
// stock adjustments via triggers, so its inserts must not be double-replayed.

const DB_NAME = 'yos360-offline';
const DB_VERSION = 1;

const STORES = ['data', 'queue', 'meta'] as const;
export type StoreName = (typeof STORES)[number];
void STORES;

export type QueuedOperation = {
  id?: number;
  table: string;
  op: 'insert' | 'update' | 'delete';
  row: Record<string, unknown>;
  rowId?: string;
  created_at: string;
  client_uuid: string;
};

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('data')) {
        db.createObjectStore('data', { keyPath: 'table' });
      }
      if (!db.objectStoreNames.contains('queue')) {
        db.createObjectStore('queue', { keyPath: 'id', autoIncrement: true });
      }
      if (!db.objectStoreNames.contains('meta')) {
        db.createObjectStore('meta', { keyPath: 'key' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function tx<T>(store: StoreName, mode: IDBTransactionMode, fn: (s: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const t = db.transaction(store, mode);
        const req = fn(t.objectStore(store));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        t.oncomplete = () => db.close();
      })
  );
}

// ---------- Data cache ----------

export async function cacheSet(table: string, rows: unknown[]): Promise<void> {
  await tx('data', 'readwrite', (s) => s.put({ table, rows, cached_at: new Date().toISOString() }));
}

export async function cacheGet<T>(table: string): Promise<{ rows: T[]; cached_at: string } | null> {
  const v = await tx<{ table: string; rows: T[]; cached_at: string } | undefined>('data', 'readonly', (s) => s.get(table));
  return v ? { rows: v.rows, cached_at: v.cached_at } : null;
}

export async function clearCache(): Promise<void> {
  await tx('data', 'readwrite', (s) => s.clear());
}

// ---------- Meta ----------

export async function metaSet(key: string, value: unknown): Promise<void> {
  await tx('meta', 'readwrite', (s) => s.put({ key, value }));
}

export async function metaGet<T>(key: string): Promise<T | null> {
  const v = await tx<{ key: string; value: T } | undefined>('meta', 'readonly', (s) => s.get(key));
  return v ? v.value : null;
}

// ---------- Queue ----------

export async function enqueue(op: Omit<QueuedOperation, 'id' | 'created_at' | 'client_uuid'>): Promise<void> {
  const entry: Omit<QueuedOperation, 'id'> = {
    ...op,
    created_at: new Date().toISOString(),
    client_uuid: crypto.randomUUID(),
  };
  await tx('queue', 'readwrite', (s) => s.add(entry));
}

export async function queueAll(): Promise<QueuedOperation[]> {
  return tx<QueuedOperation[]>('queue', 'readonly', (s) => s.getAll());
}

export async function queueRemove(id: number): Promise<void> {
  await tx('queue', 'readwrite', (s) => s.delete(id));
}

export async function queueCount(): Promise<number> {
  return tx<number>('queue', 'readonly', (s) => s.count());
}

// ---------- Sync ----------

let syncing = false;
let syncListeners: ((status: SyncStatus) => void)[] = [];

export type SyncStatus = {
  syncing: boolean;
  pending: number;
  lastSync: string | null;
  conflicts: number;
};

export function onSyncStatus(cb: (status: SyncStatus) => void): () => void {
  syncListeners.push(cb);
  return () => {
    syncListeners = syncListeners.filter((l) => l !== cb);
  };
}

async function emit(status: Partial<SyncStatus>) {
  const current: SyncStatus = {
    syncing: false,
    pending: await queueCount(),
    lastSync: (await metaGet<string>('lastSync')) ?? null,
    conflicts: (await metaGet<number>('conflicts')) ?? 0,
    ...status,
  };
  syncListeners.forEach((l) => l(current));
}

// Replay queued operations against the server.
// Conflict strategy: last-write-wins for updates; inserts use the row's
// client-generated id where the table allows it, otherwise the server id wins
// and duplicates by natural key are skipped gracefully.
export async function syncNow(): Promise<{ ok: boolean; replayed: number; conflicts: number }> {
  if (syncing) return { ok: false, replayed: 0, conflicts: 0 };
  syncing = true;
  await emit({ syncing: true });

  let replayed = 0;
  let conflicts = 0;

  try {
    const ops = await queueAll();
    for (const op of ops) {
      try {
        if (op.op === 'insert') {
          const { error } = await supabase.from(op.table).insert(op.row);
          if (error) {
            if (isDuplicateError(error)) {
              conflicts++;
            } else {
              throw error;
            }
          }
        } else if (op.op === 'update') {
          const { error } = await supabase.from(op.table).update(op.row).eq('id', op.rowId!);
          if (error) throw error;
        } else if (op.op === 'delete') {
          const { error } = await supabase.from(op.table).delete().eq('id', op.rowId!);
          if (error) throw error;
        }
        if (op.id !== undefined) await queueRemove(op.id);
        replayed++;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error('Sync op failed:', op.table, op.op, msg);
        if (isPermanentError(msg)) {
          conflicts++;
          if (op.id !== undefined) await queueRemove(op.id);
        } else {
          // Network-style failure: stop and retry later
          break;
        }
      }
    }

    await metaSet('lastSync', new Date().toISOString());
    await metaSet('conflicts', conflicts + ((await metaGet<number>('conflicts')) ?? 0));
    return { ok: true, replayed, conflicts };
  } finally {
    syncing = false;
    await emit({ syncing: false });
  }
}

function isDuplicateError(error: { message?: string; code?: string }): boolean {
  const m = (error.message || '').toLowerCase();
  return (error.code === '23505' || m.includes('duplicate key') || m.includes('unique constraint'));
}

function isPermanentError(msg: string): boolean {
  const m = msg.toLowerCase();
  return (
    m.includes('violate') ||
    m.includes('invalid') ||
    m.includes('not found') ||
    m.includes('permission') ||
    m.includes('row-level security') ||
    m.includes('check constraint')
  );
}

// ---------- Connectivity ----------

export function initConnectivityWatcher(onBack: () => void): () => void {
  const handler = () => {
    if (navigator.onLine) onBack();
  };
  window.addEventListener('online', handler);
  window.addEventListener('offline', handler);
  return () => {
    window.removeEventListener('online', handler);
    window.removeEventListener('offline', handler);
  };
}
