const DB_NAME = 'embeddly-chat';
const DB_VERSION = 1;
const STORE_CONVERSATIONS = 'conversations';
const STORE_CHAT_STATE = 'chatState';
export const MAX_CONVERSATIONS = 30;
export const MAX_MESSAGES_PER_CONVERSATION = 30;
export const ACTIVE_CONVERSATION_KEY = 'activeConversationId';
export const SIDEBAR_OPEN_KEY = 'sidebarOpen';

let dbPromise = null;
let indexedDbAvailable = typeof indexedDB !== 'undefined';
const memoryStore = {
  conversations: new Map(),
  chatState: new Map(),
};

function hasIndexedDB() {
  return indexedDbAvailable && typeof indexedDB !== 'undefined';
}

function openDB() {
  if (!hasIndexedDB()) {
    return Promise.resolve(null);
  }

  if (dbPromise) return dbPromise;

  dbPromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      dbPromise = null;
      indexedDbAvailable = false;
      reject(new Error('Failed to open IndexedDB'));
    };

    request.onsuccess = () => {
      resolve(request.result);
    };

    request.onupgradeneeded = (event) => {
      const db = event.target.result;

      if (!db.objectStoreNames.contains(STORE_CONVERSATIONS)) {
        const conversationsStore = db.createObjectStore(STORE_CONVERSATIONS, { keyPath: 'id' });
        conversationsStore.createIndex('updatedAt', 'updatedAt', { unique: false });
      }

      if (!db.objectStoreNames.contains(STORE_CHAT_STATE)) {
        db.createObjectStore(STORE_CHAT_STATE, { keyPath: 'key' });
      }
    };
  });

  return dbPromise;
}

function normalizeDate(value) {
  if (!value) return null;
  if (value instanceof Date) return value.toISOString();
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export function trimConversationMessages(messages, max = MAX_MESSAGES_PER_CONVERSATION) {
  if (!Array.isArray(messages)) return [];
  return messages.slice(-max).map((message) => ({
    ...message,
    createdAt: normalizeDate(message.createdAt) ?? new Date().toISOString(),
  }));
}

export function normalizeConversation(conversation) {
  const now = new Date().toISOString();
  return {
    ...conversation,
    title: String(conversation.title || 'New Chat').trim() || 'New Chat',
    messages: trimConversationMessages(conversation.messages),
    updatedAt: normalizeDate(conversation.updatedAt) ?? now,
    createdAt: normalizeDate(conversation.createdAt) ?? now,
  };
}

async function pruneMemoryConversations(max = MAX_CONVERSATIONS) {
  const all = Array.from(memoryStore.conversations.values());
  if (all.length <= max) return 0;

  const sorted = all.sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
  const toDelete = sorted.slice(0, all.length - max);
  toDelete.forEach((conversation) => memoryStore.conversations.delete(conversation.id));
  return toDelete.length;
}

async function withStore(storeName, mode, callback) {
  const db = await openDB();

  if (!db) {
    const target = storeName === STORE_CONVERSATIONS
      ? memoryStore.conversations
      : memoryStore.chatState;
    return callback({
      put: (value) => {
        const key = storeName === STORE_CONVERSATIONS ? value.id : value.key;
        target.set(key, value);
        return value;
      },
      get: (key) => target.get(key),
      getAll: () => Array.from(target.values()),
      delete: (key) => target.delete(key),
    });
  }

  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = callback(store);

    if (result instanceof IDBRequest) {
      result.onsuccess = () => resolve(result.result);
      result.onerror = () => reject(result.error);
    } else {
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
    }
  });
}

export async function initDB() {
  try {
    await openDB();
    return hasIndexedDB();
  } catch (error) {
    console.warn('IndexedDB unavailable, falling back to in-memory mode', error.message);
    indexedDbAvailable = false;
    return false;
  }
}

export async function saveConversation(conversation) {
  const now = new Date().toISOString();
  const conv = normalizeConversation({
    ...conversation,
    updatedAt: conversation.updatedAt ?? now,
    createdAt: conversation.createdAt || now,
  });

  try {
    await withStore(STORE_CONVERSATIONS, 'readwrite', (store) => store.put(conv));
    await pruneOldConversations(MAX_CONVERSATIONS);
    return conv;
  } catch (error) {
    if (error?.name === 'QuotaExceededError') {
      await pruneOldConversations(20);
    }
    console.warn('Failed to save conversation', error.message);
    return null;
  }
}

export async function getConversation(id) {
  try {
    return await withStore(STORE_CONVERSATIONS, 'readonly', (store) => store.get(id));
  } catch (error) {
    console.warn('Failed to get conversation', error.message);
    return null;
  }
}

export async function getAllConversations() {
  try {
    const all = await withStore(STORE_CONVERSATIONS, 'readonly', (store) => store.getAll());
    return all.sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateB - dateA;
    });
  } catch (error) {
    console.warn('Failed to get all conversations', error.message);
    return [];
  }
}

export async function deleteConversation(id) {
  try {
    await withStore(STORE_CONVERSATIONS, 'readwrite', (store) => store.delete(id));
    return true;
  } catch (error) {
    console.warn('Failed to delete conversation', error.message);
    return false;
  }
}

export async function setChatState(key, value) {
  try {
    await withStore(STORE_CHAT_STATE, 'readwrite', (store) => store.put({ key, value }));
    return true;
  } catch (error) {
    console.warn('Failed to set chat state', error.message);
    return false;
  }
}

export async function getChatState(key, defaultValue = null) {
  try {
    const result = await withStore(STORE_CHAT_STATE, 'readonly', (store) => store.get(key));
    return result ? result.value : defaultValue;
  } catch (error) {
    console.warn('Failed to get chat state', error.message);
    return defaultValue;
  }
}

export async function pruneOldConversations(max = MAX_CONVERSATIONS) {
  try {
    if (!hasIndexedDB()) {
      return pruneMemoryConversations(max);
    }

    const all = await withStore(STORE_CONVERSATIONS, 'readonly', (store) => store.getAll());
    if (all.length <= max) return 0;

    const sorted = all.sort((a, b) => {
      const dateA = new Date(a.updatedAt || 0);
      const dateB = new Date(b.updatedAt || 0);
      return dateA - dateB;
    });

    const toDelete = sorted.slice(0, all.length - max);
    const db = await openDB();

    return new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_CONVERSATIONS, 'readwrite');
      const store = tx.objectStore(STORE_CONVERSATIONS);

      toDelete.forEach((conv) => store.delete(conv.id));

      tx.oncomplete = () => resolve(toDelete.length);
      tx.onerror = () => reject(tx.error);
    });
  } catch (error) {
    console.warn('Failed to prune conversations', error.message);
    return 0;
  }
}

export async function createNewConversation(id, title = 'New Chat') {
  const now = new Date().toISOString();
  const conversation = {
    id,
    title,
    messages: [],
    createdAt: now,
    updatedAt: now,
  };

  return saveConversation(conversation);
}

export function generateTitle(firstMessage) {
  const text = (firstMessage || '').trim();
  if (!text) return 'New Chat';
  const truncated = text.slice(0, 40).trim();
  return truncated.length < text.length ? `${truncated}...` : truncated;
}

export function clearChatStorageForTests() {
  memoryStore.conversations.clear();
  memoryStore.chatState.clear();
}
