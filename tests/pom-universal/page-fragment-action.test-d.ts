import { PageFragment, type ActionFunction } from '../../src/pom-universal';

class TestFragment extends PageFragment {
  private countValue = 0;

  count = this.State(async () => this.countValue);

  increment = this.Action(async () => {
    this.countValue += 1;
    return this.countValue;
  })
    .effect(this.count, (current, previous) => current === previous + 1)
    .and(this.count, (current: number) => current > 0);

  setCount = this.Action(async (value: number) => {
    this.countValue = value;
    return this.countValue;
  }).effect((effect, value) => effect(this.count, value));

  protected override clone(): this {
    return new TestFragment(undefined) as this;
  }
}

declare const fragment: TestFragment;

const incrementAction: ActionFunction<[], number> = fragment.increment;
const setCountAction: ActionFunction<[number], number> = fragment.setCount;

// @ts-expect-error wrong action arg type
fragment.setCount('5');

class InvalidFragment extends PageFragment {
  private countValue = 0;

  count = this.State(async () => this.countValue);

  setCount = this.Action(async (value: number) => {
    this.countValue = value;
  }).effect((effect, value) =>
    // @ts-expect-error count is numeric in deferred effect callback
    effect(this.count, value.toUpperCase()));

  protected override clone(): this {
    return new InvalidFragment(undefined) as this;
  }
}

export {};
