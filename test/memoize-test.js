// @flow
import {memoize} from "../src";
import test from "ava";
import td from "testdouble";

test.beforeEach(t => {
  t.context.recorder = td.function("recorder");

  t.context.clockCounter = 0;
  t.context.clock = () => {
    t.context.clockCounter += 1;
    return t.context.clockCounter;
  };
});

test("can memoize a function", async t => {
  const func: (key: string) => Promise<string> = memoize(
    (k: string) => k,
    (key: string): Promise<string> => {
      t.context.recorder(key);
      return Promise.resolve(`${key}-value`);
    },
  );
  const firstResult = await func("test");
  t.is(firstResult, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const secondResult = await func("test");
  t.is(secondResult, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
  const thirdResult = await func("test");
  t.is(thirdResult, "test-value");
  td.verify(t.context.recorder("test"), {times: 1});
});
