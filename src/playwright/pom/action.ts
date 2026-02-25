import { test } from '@playwright/test';
import { extractParamNames } from '../../primitives/format';
import { formatActionCall } from './format';

type AsyncActionMethod<This, Args extends unknown[], R> =
  (this: This, ...args: Args) => Promise<R>;

function wrapAction<This, Args extends unknown[], R>(
  method: AsyncActionMethod<This, Args, R>,
  context: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
  stepNameOverride?: string,
): AsyncActionMethod<This, Args, R> {
  const params = extractParamNames(method);
  const methodName = String(context.name);

  return (async function wrapped(this: This, ...args: Args): Promise<R> {
    const className = (this as { constructor?: { name?: string } })?.constructor?.name ?? '<unknown>';
    const actionName = stepNameOverride ?? `${className}.${methodName}`;
    const stepName = formatActionCall(actionName, params, args);
    return test.step(stepName, () => method.apply(this, args));
  }) as AsyncActionMethod<This, Args, R>;
}

export function Action<This, Args extends unknown[], R>(
  method: AsyncActionMethod<This, Args, R>,
  context: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
): AsyncActionMethod<This, Args, R>;

export function Action(stepName: string):
  <This, Args extends unknown[], R>(
    method: AsyncActionMethod<This, Args, R>,
    context: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
  ) => AsyncActionMethod<This, Args, R>;

export function Action<This, Args extends unknown[], R>(
  first: string | AsyncActionMethod<This, Args, R>,
  second?: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
):
  | AsyncActionMethod<This, Args, R>
  | ((
    method: AsyncActionMethod<This, Args, R>,
    context: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
  ) => AsyncActionMethod<This, Args, R>) {
  if (typeof first === 'function') {
    if (!second || second.kind !== 'method') {
      throw new TypeError('@Action can only decorate methods.');
    }
    return wrapAction(first, second);
  }

  return function actionDecorator<This, Args extends unknown[], R>(
    method: AsyncActionMethod<This, Args, R>,
    context: ClassMethodDecoratorContext<This, AsyncActionMethod<This, Args, R>>,
  ): AsyncActionMethod<This, Args, R> {
    if (context.kind !== 'method') {
      throw new TypeError('@Action can only decorate methods.');
    }
    return wrapAction(method, context, first);
  };
}
