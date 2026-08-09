/** `plural(1, "film")` → "film"; `plural(3, "film")` → "films". */
export function plural(count: number, noun: string): string {
  return count === 1 ? noun : `${noun}s`;
}
