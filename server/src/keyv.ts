import { Keyv } from "keyv";
import { randomUUID } from "node:crypto";

/**
 * Keys in Keyv are strings
 */
export type Key = string;

/**
 * An object allowing access to a repository of key-value data.
 */
export interface Repo<Value> {
  /**
   * Add a value to the repository with a new, random key
   * @param value
   * @returns the new key
   */
  add: (value: Value) => Promise<Key>;

  /**
   * Associates a key with a value. Creates a new key-value mapping if one did
   * not already exist.
   * @param key
   * @param value
   */
  set: (key: Key, value: Value) => Promise<void>;

  /**
   * Search for the value associated with a key that may or may not have an
   * associated value.
   * @param key
   * @returns The value associated with that key, or null if there is no such value
   */
  find: (key: Key) => Promise<Value | null>;

  /**
   * Retrieve the value associated with a key.
   * @param key
   * @returns
   * @throws If the key does not exist
   */
  get: (key: Key) => Promise<Value>;

  /**
   * Retrieve the values associated with a list of keys.
   * @param keys
   * @returns values in the same order as the given keys
   * @throws If any keys are not defined
   */
  getMany: (keys: Key[]) => Promise<Value[]>;

  /**
   * Return all the keys in a key-value repository
   * @returns An array of valid keys
   */
  getAllKeys: () => Promise<Key[]>;

  /**
   * Removes all key-value pairs from storage
   * @returns
   */
  clear: () => Promise<void>;
}

/** Singleton initializer for databases */
let globalDbInitializer: null | (<T>(name: string) => Keyv<T>) = null;

/**
 * A Keyv data store can have any number of storage adapters, allowing Keyv
 * data to be stored in a persistent database like MongoDB.
 *
 * By default, Keyv data stores created with `createRepo` will use the
 * in-memory storage adapter; this function allows Keyv stores to be created
 * in some different way.
 *
 * @param initializer - A function that takes a collection name and creates a new Keyv store
 * @throws if `setDbInitializer` have been called previously, or if any methods on any repos created with `createRepo` have been accessed
 */
export function setDbInitializer(initializer: <T>(name: string) => Keyv<T>): void {
  if (globalDbInitializer !== null) {
    throw new Error("Database initializer cannot be set a second time");
  } else {
    globalDbInitializer = initializer;
  }
}

/**
 * Creates a new repository that stores key-value pairs.
 *
 * @param repoName - A distinct identifier for this repository. The behavior is undefined if `createRepo` is invoked with the same repoName multiple times.
 * @returns A new `Repo` object
 */
export function createRepo<T = unknown>(repoName: string): Repo<T> {
  let _store: Keyv<T> | null = null;
  function getStore(): Keyv<T> {
    if (globalDbInitializer === null) {
      // setDbInitializer was never called, so just initialize the default in-memory keyv
      globalDbInitializer = <T>(_name: string) => new Keyv<T>();
    }
    if (_store === null) {
      _store = globalDbInitializer(repoName);
    }
    return _store;
  }

  return {
    add: async (value) => {
      const store = getStore();
      const key = randomUUID().toString();
      if (!(await store.set(key, value))) {
        throw new Error(`Failed to set new key ${key} in repository ${repoName}`);
      }
      return key;
    },

    set: async (key, value) => {
      const store = getStore();
      if (!(await store.set(key, value))) {
        throw new Error(`Failed to set key ${key} in repository ${repoName}`);
      }
    },

    get: async (key) => {
      const store = getStore();
      const value = await store.get(key);
      if (!value) throw new Error(`Failed to find key ${key} in repository ${repoName}`);

      return value;
    },

    getMany: async (keys) => {
      const store = getStore();
      const values = await store.getMany(keys);
      return values.filter((v): v is T => {
        if (v === undefined) {
          throw new Error(`getMany in repository ${repoName} had undefined keys`);
        }
        return true;
      });
    },

    getAllKeys: async () => {
      const store = getStore();
      const result: string[] = [];
      for await (const [key] of store.iterator!(undefined)) {
        result.push(key as string);
      }
      return result;
    },

    find: async (key) => {
      const store = getStore();
      const value = await store.get(key);
      if (value === undefined) return null;
      return value;
    },

    clear: async () => {
      if (_store !== null) {
        await _store.clear();
      }
    },
  };
}
