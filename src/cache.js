// @flow

import type {Duration} from "@prodo-ai/js-timing";
import type {
  Cache,
  CachedValue,
  CacheOptions,
  KeyAndValue,
  Timestamp,
  ValueForCaching,
} from "./types";
import type {MaybePromise} from "@prodo-ai/js-async";

import {waitUntil} from "@prodo-ai/js-async";
import {duration, HOUR, MILLISECOND, MILLISECONDS} from "@prodo-ai/js-timing";
import _ from "lodash";

const DEFAULT_CLEANUP_INTERVAL = duration(1, HOUR);

const validateOptions = (options: CacheOptions) => {
  if (options.size != null && options.size <= 0) {
    throw new Error("`options.size` must be greater than 0.");
  }
};

export function createCache<K, V>(
  hasher: (key: K) => string,
  create: (key: K) => MaybePromise<ValueForCaching<V>>,
  options?: CacheOptions = {},
): Cache<K, V> {
  validateOptions(options);

  if (options.expiry) {
    const cleanupInterval = options.cleanupInterval || DEFAULT_CLEANUP_INTERVAL;
    const scheduleIn = (delay: Duration, behaviour: () => Promise<void>) =>
      (options.setTimeout || setTimeout)(behaviour, delay.in(MILLISECONDS));
    const scheduleShrinking = () => {
      scheduleIn(cleanupInterval, async () => {
        await shrinkCache(clock());
        scheduleShrinking();
      });
    };
    scheduleShrinking();
  }

  const clock = options.clock || Date.now;
  const expiryInMilliseconds: ?Timestamp =
    options.expiry && options.expiry.in(MILLISECONDS);

  const initializing: Set<string> = new Set();
  const store: {[hash: string]: CachedValue<V>} = {};

  let shrinkLock = false;
  const shrinkCache = async (now: Timestamp) => {
    if (shrinkLock) {
      return;
    }
    if ((options.size && options.size < currentSize()) || options.expiry) {
      try {
        shrinkLock = true;
        await trim(now);
      } finally {
        shrinkLock = false;
      }
    }
  };

  const trim = async (now: Timestamp) => {
    const oldestValues = options.size
      ? _(store)
          .toPairs()
          .sortBy(([, value]) => value.timestamp)
          .reverse()
          .slice(options.size)
          .map(([hash]) => hash)
      : [];
    const expiredValues = options.expiry
      ? Object.keys(store).filter(hash => isExpired(hash, now))
      : [];
    await Promise.all(
      oldestValues.concat(expiredValues).map(async hash => {
        if (store[hash].locked > 0) {
          return;
        }
        try {
          if (store[hash].destroy) {
            await store[hash].destroy();
          }
          delete store[hash];
        } catch (error) {
          return;
        }
      }),
    );
  };

  const addToStore = async (
    hash: string,
    key: K,
    now: Timestamp,
  ): Promise<CachedValue<V>> => {
    initializing.add(hash);
    try {
      const value = await create(key);
      const cachedValue = {
        ...value,
        insertionTimestamp: now,
        timestamp: now,
        locked: 0,
      };
      store[hash] = cachedValue;
      await shrinkCache(now);
      return cachedValue;
    } finally {
      initializing.delete(hash);
    }
  };

  const isExpired = (hash: string, now: Timestamp): boolean =>
    expiryInMilliseconds
      ? store[hash].insertionTimestamp + expiryInMilliseconds < now
      : false;

  function getCachedValue(key: K): Promise<CachedValue<V>> {
    const hash = hasher(key);
    const now = clock();
    return getOrInsertCachedValue(key, hash, now);
  }

  async function getOrInsertCachedValue(
    key: K,
    hash: string,
    now: Timestamp,
  ): Promise<CachedValue<V>> {
    if ((!(hash in store) || isExpired(hash, now)) && !initializing.has(hash)) {
      return addToStore(hash, key, now);
    } else if (initializing.has(hash)) {
      await waitUntil({
        condition: () => !initializing.has(hash),
        pauseTime: duration(1, MILLISECOND),
      });
    }
    if (!(hash in store)) {
      return getOrInsertCachedValue(key, hash, now);
    }
    store[hash].timestamp = now;
    return store[hash];
  }

  async function getWith<W>(
    key: K,
    transformer: (value: V) => MaybePromise<W>,
  ): Promise<W> {
    const cachedValue = await getCachedValue(key);
    cachedValue.locked++;
    let result;
    try {
      result = await transformer(cachedValue.value);
    } finally {
      cachedValue.locked--;
    }
    return result;
  }

  async function getMultipleWith<W>(
    keys: K[],
    transformer: (keysAndValues: KeyAndValue<K, V>[]) => MaybePromise<W>,
  ): Promise<W> {
    const keysAndCachedValues = await Promise.all(
      keys.map(async key => {
        const cachedValue = await getCachedValue(key);
        cachedValue.locked++;
        return {
          key,
          cachedValue,
        };
      }),
    );
    let result;
    try {
      result = await transformer(
        keysAndCachedValues.map(({key, cachedValue: {value}}) => ({
          key,
          value,
        })),
      );
    } finally {
      keysAndCachedValues
        .map(({cachedValue}) => cachedValue)
        .forEach(cachedValue => {
          cachedValue.locked--;
        });
    }
    return result;
  }

  const currentSize = () => _.size(store);

  return {
    async get(key: K): Promise<V> {
      return (await getCachedValue(key)).value;
    },
    getMultiple(keys: K[]): Promise<KeyAndValue<K, V>[]> {
      return Promise.all(
        keys.map(async key => ({
          key,
          value: (await getCachedValue(key)).value,
        })),
      );
    },
    getWith,
    getMultipleWith,
    currentSize,
  };
}
