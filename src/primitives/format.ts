/**
 * Formats a value for display in error messages and logs.
 * @internal
 */
export function formatValue(value: unknown, maxLength = 50): string {
  if (value === undefined) return 'undefined';
  if (value === null) return 'null';
  if (typeof value === 'string') {
    if (value.length > maxLength) return `"${value.slice(0, maxLength)}..."`;
    return `"${value}"`;
  }
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    if (value.length > 3) {
      return `[${value.slice(0, 3).map(v => formatValue(v, 20)).join(', ')}, ...]`;
    }
    return `[${value.map(v => formatValue(v, 20)).join(', ')}]`;
  }
  if (typeof value === 'object') {
    try {
      const str = JSON.stringify(value);
      if (str.length > maxLength) return str.slice(0, maxLength) + '...';
      return str;
    } catch {
      return '[Complex Object]';
    }
  }
  return String(value);
}
