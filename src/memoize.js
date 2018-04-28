// @flow

import type {MaybePromise} from "@prodo-ai/js-async";
import type {CacheOptions} from "./types";

import {createCache} from "./cache";

export function memoize<K, V>(
  hash: (key: K) => string,
  behaviour: (key: K) => MaybePromise<V>,
  options?: CacheOptions = {},
): (key: K) => Promise<V> {
  const cache = createCache(
    hash,
    async (key: K) => ({value: await behaviour(key)}),
    options,
  );
  return (key: K) => cache.get(key);
}
