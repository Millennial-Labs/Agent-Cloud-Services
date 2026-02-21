import type { DetailLevel, DisplayOptions } from "../types/output";

export interface TextRenderer<T> {
  (data: T, detail: DetailLevel): string[];
}

export function resolveDetailLevel(input?: string): DetailLevel {
  if (!input) {
    return "concise";
  }

  const normalized = input.toLowerCase();
  if (
    normalized === "concise" ||
    normalized === "standard" ||
    normalized === "full"
  ) {
    return normalized;
  }

  throw new Error(
    `Invalid detail level "${input}". Expected one of: concise, standard, full.`
  );
}

export function emitOutput<T>(
  data: T,
  options: DisplayOptions,
  renderText: TextRenderer<T>
): void {
  if (options.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
    return;
  }

  const detail = options.detail ?? "concise";
  const lines = renderText(data, detail);
  for (const line of lines) {
    process.stdout.write(`${line}\n`);
  }
}

export function maskSecret(value: string, visible = 4): string {
  if (value.length <= visible) {
    return "*".repeat(value.length);
  }

  const suffix = value.slice(-visible);
  return `${"*".repeat(Math.max(4, value.length - visible))}${suffix}`;
}

export function boolLabel(value: boolean): string {
  return value ? "yes" : "no";
}
