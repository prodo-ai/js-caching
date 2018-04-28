// @flow

import {waitUntil} from "@prodo-ai/js-async";
import {createCache} from "../src";
import {
  duration,
  MILLISECOND,
  MILLISECONDS,
  SECOND,
  waitFor,
} from "@prodo-ai/js-timing";
import test from "ava";
import _ from "lodash";
import td from "testdouble";

test.beforeEach(t => {
  t.context.recorder = td.function("recorder");

  t.context.clockCounter = 0;
  t.context.clock = () => {
    t.context.clockCounter += 1;
    return t.context.clockCounter;
  };
});

test("can create a cache", async t => {
  const cache = createCache(
    k => k,
    (key: string) => ({value: `${key}-value`}),
    {
      clock: t.context.clock,
    },
  );
  const storedValue = await cache.get("test");
  t.is(storedValue, "test-value");
});

test("objects are fetched from the cache if they exist", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {
      clock: t.context.clock,
    },
  );
  const firstValue = await cache.get("test");
  t.is(firstValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const secondValue = await cache.get("test");
  t.is(secondValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
});

test("cache can store multiple values", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {
      clock: t.context.clock,
    },
  );
  const testValue = await cache.get("test");
  t.is(testValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const test2Value = await cache.get("test-2");
  t.is(test2Value, "test-2-value");
  td.verify(t.context.recorder("test-2"), {times: 1});
});

test("can validate options.size", t => {
  const error = t.throws(() =>
    createCache((key: string) => key, (key: string) => ({value: key}), {
      size: 0,
      clock: t.context.clock,
    }),
  );
  t.is(error.message, "`options.size` must be greater than 0.");
});

test("can create cache with max size", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {size: 2, clock: t.context.clock},
  );
  const firstTestValue = await cache.get("test");
  t.is(firstTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const test2Value = await cache.get("test-2");
  t.is(test2Value, "test-2-value");
  td.verify(t.context.recorder("test-2"), {times: 1});
  const test3Value = await cache.get("test-3");
  t.is(test3Value, "test-3-value");
  td.verify(t.context.recorder("test-3"), {times: 1});
  const secondTestValue = await cache.get("test");
  t.is(secondTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 2});
});

test("timestamp is reset on get", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {size: 2, clock: t.context.clock},
  );
  const firstTestValue = await cache.get("test");
  t.is(firstTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const test2Value = await cache.get("test-2");
  t.is(test2Value, "test-2-value");
  td.verify(t.context.recorder("test-2"), {times: 1});
  const secondTestValue = await cache.get("test");
  t.is(secondTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const test3Value = await cache.get("test-3");
  t.is(test3Value, "test-3-value");
  td.verify(t.context.recorder("test-3"), {times: 1});
  const thirdTestValue = await cache.get("test");
  t.is(thirdTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
});

test("an expiry time can be set for all items", async t => {
  let value = 0;
  let time = 0;
  const expiry = duration(5, MILLISECONDS);
  const cache = createCache(k => k, () => ({value}), {
    clock: () => time,
    expiry,
  });

  value = 1;
  t.is(await cache.get("test"), 1);

  // Update the value
  value = 2;

  // No time has passed, so the initial value has not expired
  t.is(await cache.get("test"), 1);

  // Some time has passed, but not enough
  time = 3;
  t.is(await cache.get("test"), 1);

  // Enough time has passed, so we should refresh the cache.
  time = 6;
  t.is(await cache.get("test"), 2);
});

test("the cache is routinely cleaned of expired values", async t => {
  let value = 0;
  let time = 0;
  const expiry = duration(5, MILLISECONDS);
  let invokeCleanup = () => {
    throw new Error("invokeCleanup was never set.");
  };
  const setTimeout = (behaviour: () => Promise<void>) => {
    invokeCleanup = behaviour;
  };
  const cache = createCache(k => k, () => ({value}), {
    clock: () => time,
    setTimeout,
    expiry,
  });

  value = 1;
  t.is(await cache.get("a"), 1);

  // Some time has passed, but not enough
  time = 3;
  value = 2;
  t.is(await cache.get("a"), 1);
  t.is(await cache.get("b"), 2);

  // now enough time has passed that A has expired
  time = 6;
  t.is(cache.currentSize(), 2);
  await invokeCleanup();
  t.is(cache.currentSize(), 1);

  value = 3;
  t.is(await cache.get("a"), 3);
  t.is(await cache.get("b"), 2);
});

test("elements are only initialized once", async t => {
  const cache = createCache(
    k => k,
    async (key: string) => {
      t.context.recorder(key);
      await new Promise(resolve => setTimeout(resolve, 0));
      return {value: `${key}-value`};
    },
    {size: 1, clock: t.context.clock},
  );

  await Promise.all(_.range(100).map(() => cache.get("test")));
  td.verify(t.context.recorder("test"), {times: 1});
  t.pass();
});

test("waiting for initialization never returns `undefined`", async t => {
  const valueOf = (key: number): string => `${key}-value`;
  const cache = createCache(
    k => k.toString(),
    async (key: number) => {
      await waitFor(duration(100 * Math.random(), MILLISECONDS));
      return {value: valueOf(key)};
    },
    {size: 1},
  );
  const keys = _.range(100).map(value => value % 10);

  const actualValues = await cache.getMultiple(keys);

  const expectedValues = keys.map(key => ({key, value: valueOf(key)}));
  t.deepEqual(actualValues, expectedValues);
});

test("can access cache via callback", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
  );
  const testValueFromCallback = await cache.getWith("test", (value: string) => {
    return `${value}-from-callback`;
  });
  t.is(testValueFromCallback, "test-value-from-callback");
});

test("cache locks entries and won't delete locked entries", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {size: 1, clock: t.context.clock},
  );
  const firstTestValue = await cache.get("test");
  t.is(firstTestValue, "test-value");
  let test2Created = false;
  await Promise.all([
    cache.getWith("test", async () => {
      await waitUntil({
        condition: () => test2Created,
        pauseTime: duration(1, MILLISECOND),
        timeout: duration(1, SECOND),
      });
      const secondTestValue = await cache.get("test");
      t.is(secondTestValue, "test-value");
      td.verify(t.context.recorder("test"), {times: 1});
    }),
    (async () => {
      const test2Value = await cache.get("test-2");
      test2Created = true;
      t.is(test2Value, "test-2-value");
      td.verify(t.context.recorder("test-2"), {times: 1});
    })(),
  ]);
});

test("cache deletes entries once they are unlocked", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {size: 1, clock: t.context.clock},
  );
  const firstTestValue = await cache.get("test");
  t.is(firstTestValue, "test-value");
  let test2Created = false;
  await Promise.all([
    cache.getWith("test", async () => {
      await waitUntil({
        condition: () => test2Created,
        pauseTime: duration(1, MILLISECOND),
        timeout: duration(1, SECOND),
      });
      const secondTestValue = await cache.get("test");
      t.is(secondTestValue, "test-value");
      td.verify(t.context.recorder("test"), {times: 1});
    }),
    (async () => {
      const test2Value = await cache.get("test-2");
      test2Created = true;
      t.is(test2Value, "test-2-value");
      td.verify(t.context.recorder("test-2"), {times: 1});
    })(),
  ]);
  const test3Value = await cache.get("test-3");
  t.is(test3Value, "test-3-value");
  td.verify(t.context.recorder("test-3"), {times: 1});
  const thirdTestValue = await cache.get("test");
  t.is(thirdTestValue, "test-value");
  td.verify(t.context.recorder("test"), {times: 2});
});

test("cache can have custom destroyers", async t => {
  const destroy = td.function("destroy");
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {
        value: `${key}-value`,
        destroy: () => destroy(key),
      };
    },
    {size: 1, clock: t.context.clock},
  );
  const testValue = await cache.get("test");
  t.is(testValue, "test-value");
  const test2Value = await cache.get("test-2");
  t.is(test2Value, "test-2-value");
  td.verify(destroy("test"), {times: 1});
});

test("can get multiple values from a cache", async t => {
  const cache = createCache(k => k, (key: string) => ({value: `${key}-value`}));
  const testValues = await cache.getMultiple(["test", "test-2"]);
  t.deepEqual(testValues, [
    {key: "test", value: "test-value"},
    {key: "test-2", value: "test-2-value"},
  ]);
});

test("getting multiple values uses the cache", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
  );
  await cache.get("test");
  await cache.get("test-2");
  td.verify(t.context.recorder("test"), {times: 1});
  td.verify(t.context.recorder("test-2"), {times: 1});

  const testValues = await cache.getMultiple(["test", "test-2", "test-3"]);
  t.deepEqual(testValues, [
    {key: "test", value: "test-value"},
    {key: "test-2", value: "test-2-value"},
    {key: "test-3", value: "test-3-value"},
  ]);
  td.verify(t.context.recorder("test"), {times: 1});
  td.verify(t.context.recorder("test-2"), {times: 1});
  td.verify(t.context.recorder("test-3"), {times: 1});
});

test("getting multiple values works with a tiny cache size", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
    {size: 1},
  );
  await cache.get("test");
  await cache.get("test-2");
  td.verify(t.context.recorder("test"), {times: 1});
  td.verify(t.context.recorder("test-2"), {times: 1});

  const testValues = await cache.getMultiple(["test", "test-2", "test-3"]);
  t.deepEqual(testValues, [
    {key: "test", value: "test-value"},
    {key: "test-2", value: "test-2-value"},
    {key: "test-3", value: "test-3-value"},
  ]);
  td.verify(t.context.recorder("test"), {times: 2});
  td.verify(t.context.recorder("test-2"), {times: 1});
  td.verify(t.context.recorder("test-3"), {times: 1});
});

test("can get multiple entries with callback", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
  );
  const testValues = await cache.getMultipleWith(
    ["test", "test-2", "test-3"],
    keysAndValues =>
      keysAndValues.map(({key, value}) => ({
        key,
        value: `${value}-from-callback`,
      })),
  );
  t.deepEqual(testValues, [
    {key: "test", value: "test-value-from-callback"},
    {key: "test-2", value: "test-2-value-from-callback"},
    {key: "test-3", value: "test-3-value-from-callback"},
  ]);
});

test("can lock multiple entries", async t => {
  const cache = createCache(
    k => k,
    (key: string) => {
      t.context.recorder(key);
      return {value: `${key}-value`};
    },
  );
  let test2Created = false;
  await Promise.all([
    cache.getMultipleWith(["test"], async () => {
      await waitUntil({
        condition: () => test2Created,
        pauseTime: duration(1, MILLISECOND),
        timeout: duration(1, SECOND),
      });
      const secondTestValue = await cache.get("test");
      t.is(secondTestValue, "test-value");
      td.verify(t.context.recorder("test"), {times: 1});
    }),
    (async () => {
      const test2Value = await cache.get("test-2");
      test2Created = true;
      t.is(test2Value, "test-2-value");
      td.verify(t.context.recorder("test-2"), {times: 1});
    })(),
  ]);
});
