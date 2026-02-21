import { formatValue } from '../../primitives/format';

/** @internal */
export function formatActionCall(actionName: string, params: string[], args: unknown[]): string {
  if (args.length === 0) return `${actionName}()`;
  const formattedArgs = params.map((name, i) => {
    return `${name}: ${formatValue(args[i])}`;
  }).join(', ');
  return `${actionName}(${formattedArgs})`;
}
