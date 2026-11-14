/**
 * Tiny class-name helper.
 *
 * A deliberately local implementation so the frontend does not need an extra
 * dependency for conditional classes. Accepts any number of values: strings,
 * arrays, or objects whose truthy keys contribute their key.
 */
type Input = string | number | false | null | undefined | Record<string, unknown> | Input[];

function cn(...inputs: Input[]): string {
  const classes: string[] = [];

  for (const input of inputs) {
    if (!input) {
      continue;
    }
    if (typeof input === "string" || typeof input === "number") {
      classes.push(String(input));
      continue;
    }
    if (Array.isArray(input)) {
      classes.push(cn(...input));
      continue;
    }
    for (const [key, value] of Object.entries(input)) {
      if (value) {
        classes.push(key);
      }
    }
  }

  return classes.join(" ");
}

export { cn };