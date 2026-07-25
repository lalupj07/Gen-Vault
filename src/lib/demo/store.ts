import type { DemoState } from './types';
import { createSeedState } from './seed';

const DB_NAME = 'genvault-demo';
const STORE = 'state';
const KEY = 'main';

let memory: DemoState | null = null;

function canUseIdb(): boolean {
  return typeof indexedDB !== 'undefined';
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function idbGet(): Promise<DemoState | null> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readonly');
    const req = tx.objectStore(STORE).get(KEY);
    req.onsuccess = () => resolve((req.result as DemoState) ?? null);
    req.onerror = () => reject(req.error);
  });
}

async function idbSet(state: DemoState): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(state, KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

async function idbClear(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(KEY);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
  });
}

export async function loadState(): Promise<DemoState> {
  if (!canUseIdb()) {
    if (!memory) memory = await createSeedState();
    return structuredClone(memory);
  }
  let state = await idbGet();
  if (!state || state.schemaVersion !== 1) {
    state = await createSeedState();
    await idbSet(state);
  }
  memory = state;
  return structuredClone(state);
}

export async function saveState(state: DemoState): Promise<void> {
  memory = structuredClone(state);
  if (canUseIdb()) await idbSet(memory);
}

export async function resetDemo(): Promise<DemoState> {
  memory = null;
  if (canUseIdb()) await idbClear();
  const fresh = await createSeedState();
  await saveState(fresh);
  return structuredClone(fresh);
}
