import { formatValue } from '../../primitives/format';

/** @internal */
export function formatActionCall(actionName: string, params: string[], args: unknown[]): string {
  if (args.length === 0) return `${actionName}()`;
  const formattedArgs = args.map((arg, i) => {
    const name = params[i] ?? `arg${i + 1}`;
    return `${name}: ${formatValue(arg)}`;
  }).join(', ');
  return `${actionName}(${formattedArgs})`;
}
