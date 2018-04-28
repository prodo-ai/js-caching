// @flow

export type {
  Cache,
  CachedValue,
  CacheOptions,
  KeyAndValue,
  Timestamp,
  ValueForCaching,
} from "./types";

export {createCache} from "./cache";
export {memoize} from "./memoize";

import {createCache} from "./cache";
export default createCache;
