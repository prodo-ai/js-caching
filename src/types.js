// @flow

import type {MaybePromise} from "@prodo-ai/js-async";
import type {Duration} from "@prodo-ai/js-timing";

export type Timestamp = number;

export type CacheOptions = {
  size?: number,
  expiry?: Duration,
  cleanupInterval?: Duration,
  clock?: () => Timestamp,
  setTimeout?: (behaviour: () => Promise<void>, delay: number) => void,
};

export type KeyAndValue<K, V> = {|
  key: K,
  value: V,
|};

export type Cache<K, V> = {
  get: (key: K) => Promise<V>,
  getMultiple: (keys: K[]) => Promise<KeyAndValue<K, V>[]>,
  getWith: <W>(
    key: K,
    transformer: (value: V) => MaybePromise<W>,
  ) => Promise<W>,
  getMultipleWith: <W>(
    keys: K[],
    transformer: (keysAndValues: KeyAndValue<K, V>[]) => MaybePromise<W>,
  ) => Promise<W>,
  currentSize: () => number,
};

export type CachedValue<V> = {|
  value: V,
  insertionTimestamp: number,
  timestamp: number,
  locked: number,
  destroy?: () => Promise<void>,
|};

export type ValueForCaching<V> = {|
  value: V,
  destroy?: () => Promise<void>,
|};
