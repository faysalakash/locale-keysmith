import fg from "fast-glob";

export const IGNORED_DIRECTORIES = ["**/node_modules/**", "**/dist/**", "**/.next/**"];

export function globFiles(
  patterns: string[],
  cwd = process.cwd(),
  extraIgnore: string[] = []
): Promise<string[]> {
  return fg(patterns, { cwd, absolute: true, ignore: [...IGNORED_DIRECTORIES, ...extraIgnore] });
}
