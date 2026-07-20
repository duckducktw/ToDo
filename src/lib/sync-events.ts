export type SyncEventKind = "tasks" | "settings";

type SyncListener = (kind: SyncEventKind) => void;

const syncGlobal = globalThis as typeof globalThis & {
  __flowTodoSyncListeners?: Map<string, Set<SyncListener>>;
};

function listeners() {
  syncGlobal.__flowTodoSyncListeners ??= new Map();
  return syncGlobal.__flowTodoSyncListeners;
}

export function publishSyncEvent(userId: string, kind: SyncEventKind): void {
  listeners().get(userId)?.forEach((listener) => listener(kind));
}

export function subscribeToSyncEvents(userId: string, listener: SyncListener): () => void {
  const userListeners = listeners().get(userId) ?? new Set<SyncListener>();
  userListeners.add(listener);
  listeners().set(userId, userListeners);
  return () => {
    userListeners.delete(listener);
    if (userListeners.size === 0) listeners().delete(userId);
  };
}
