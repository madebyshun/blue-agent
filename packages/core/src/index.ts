export * from "./schemas";
export * from "./tool-inputs";

export function formatUsd(n: number): string {
  return `$${n.toFixed(2)}`;
}
