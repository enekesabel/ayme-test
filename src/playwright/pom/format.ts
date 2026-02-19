import { formatValue } from '../../primitives/format';

/** @internal */
export function extractParamNames(fn: Function): string[] {
  const fnStr = fn.toString();
  const arrowMatch = fnStr.match(/^\s*(?:async\s+)?(?:\(([^)]*)\)|(\w+))\s*=>/);
  const funcMatch = fnStr.match(/^\s*(?:async\s+)?function\s*\w*\s*\(([^)]*)\)/);
  const paramsStr = arrowMatch?.[1] ?? arrowMatch?.[2] ?? funcMatch?.[1] ?? '';
  if (!paramsStr.trim()) return [];
  return paramsStr.split(',').map(p => {
    const cleaned = p.trim().split(/[=:]/)[0]?.trim() ?? '';
    if (cleaned.startsWith('{')) return '{...}';
    if (cleaned.startsWith('[')) return '[...]';
    return cleaned;
  }).filter(Boolean);
}

/** @internal */
export function formatActionCall(actionName: string, paramNames: string[], args: unknown[]): string {
  if (args.length === 0) return `${actionName}()`;
  const formattedArgs = paramNames.map((name, i) => {
    return `${name}: ${formatValue(args[i])}`;
  }).join(', ');
  return `${actionName}(${formattedArgs})`;
}
