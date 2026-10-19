import { supabase } from '@/lib/supabase';
import { cacheSet, cacheGet, enqueue } from '@/lib/offline';

// Data layer used by every page. Online: normal Supabase calls.
// Offline: reads come from the IndexedDB cache; writes are queued locally and
// replayed by syncNow() when connectivity returns.

export type DataMode = 'online' | 'offline';

export function isOnline(): boolean {
  return navigator.onLine;
}

export async function fetchTable<T>(
  table: string,
  select: string,
  order: { column: string; ascending?: boolean } | null,
  limit?: number
): Promise<T[]> {
  if (isOnline()) {
    let q = supabase.from(table).select(select);
    if (order) q = q.order(order.column, { ascending: order.ascending ?? false });
    if (limit) q = q.limit(limit);
    const { data, error } = await q;
    if (error) {
      // Network drop mid-request: fall back to cache
      const cached = await cacheGet<T>(table);
      return cached?.rows ?? [];
    }
    await cacheSet(table, data ?? []);
    return (data ?? []) as T[];
  }
  const cached = await cacheGet<T>(table);
  return cached?.rows ?? [];
}

// Write helper. Returns { offline: true } when the write was queued locally.
export async function writeRow(
  table: string,
  op: 'insert' | 'update' | 'delete',
  row: Record<string, unknown>,
  rowId?: string
): Promise<{ offline: boolean; error: string | null }> {
  if (isOnline()) {
    try {
      if (op === 'insert') {
        const { error } = await supabase.from(table).insert(row);
        if (error) return { offline: false, error: error.message };
      } else if (op === 'update') {
        const { error } = await supabase.from(table).update(row).eq('id', rowId!);
        if (error) return { offline: false, error: error.message };
      } else {
        const { error } = await supabase.from(table).delete().eq('id', rowId!);
        if (error) return { offline: false, error: error.message };
      }
      return { offline: false, error: null };
    } catch {
      // Request failed (network): queue it
      await enqueue({ table, op, row, rowId });
      return { offline: true, error: null };
    }
  }
  await enqueue({ table, op, row, rowId });
  return { offline: true, error: null };
}

// Optimistically update the cached table so the UI reflects offline writes.
export async function applyLocalCache(
  table: string,
  op: 'insert' | 'update' | 'delete',
  row: Record<string, unknown>,
  rowId?: string
): Promise<void> {
  const cached = await cacheGet<Record<string, unknown>>(table);
  let rows = cached?.rows ?? [];
  if (op === 'insert') {
    rows = [...rows, { ...row, _pending: true }];
  } else if (op === 'update') {
    rows = rows.map((r) => ((r as { id?: string }).id === rowId ? { ...r, ...row, _pending: true } : r));
  } else {
    rows = rows.filter((r) => (r as { id?: string }).id !== rowId);
  }
  await cacheSet(table, rows);
}
