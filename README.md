# JS ASync

Utility library for caching.

## Usage

A `Cache` wraps a function (both synchronous or asynchronous) to ensure that results are cached for later use.

To create a `Cache` object, use the `createCache` method:

```javascript
import {createCache} from "@prodo-ai/js-caching";

const cache = createCache(
  key => key,
  async key => ({
    value: await service.getValue(key),
  }),
);

const firstResult = cache.get("first");       // Will use `service`.
const secondResult = cache.get("second");     // Will use `service`.
const firstResultAgain = cache.get("first");  // Will use the cache.
```

The first parameter `hasher` is used to create a unique string for each key. This is the hash that uniquely identifies the result in the cache.

The second parameter `create` is the factory method to fetch results that don't exist in the hash. The return value of this function should be an object containing the following properties:

* `value` - the value to store in the cache
* `destroy` - an optional callback that will destroy and clean-up the cached value.

For example, if your cache stores references to information stored on disk, your `destroy` function would delete the information from the disk. This function is only called when the value is removed from the cache.

You can also pass additional options as a third parameter to gain greater control over the cache:

* `size` - the number of results to store in the cache.
* `expiry` - a `Duration` (see [@prodo-ai/js-timing](https://github.com/prodo-ai/js-timing)) that determines how long to keep a result for.
* `cleanupInterval` - a `Duration` that specifies how frequently to run garbage collection.

### memoize

The most simple use of a cache is to memoize a function. This can be done using the `memoize` helper:

```javascript
import {memoize} from "@prodo-ai/js-caching";

const func = (args) => {/*...*/};
const hasher = (args) => {/* create a hash of the args */};
const memoizedFunc = memoize(hasher, func);

const firstResult = memoizedFunc("first");
const secondResult = memoizedFunc("second");
const firstResultAgain = memoizedFunc("first");  // Will use the cache.
```

## Information

Owner: Prodo Tech Ltd

Maintainer: [tdawes](https://github.com/tdawes)

License: UNLICENSED (for now)
