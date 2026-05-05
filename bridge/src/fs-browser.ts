import { readdir } from "node:fs/promises";
import { join } from "node:path";

export interface FsEntry {
  name: string;
  path: string;
  type: "directory" | "file";
}

export async function browseDir(dirPath: string): Promise<FsEntry[]> {
  try {
    const entries = await readdir(dirPath, { withFileTypes: true });
    const results: FsEntry[] = [];
    for (const entry of entries) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = join(dirPath, entry.name);
      if (entry.isDirectory()) {
        results.push({ name: entry.name, path: fullPath, type: "directory" });
      } else if (entry.isFile()) {
        results.push({ name: entry.name, path: fullPath, type: "file" });
      }
    }
    results.sort((a, b) => {
      if (a.type === b.type) return a.name.localeCompare(b.name);
      return a.type === "directory" ? -1 : 1;
    });
    return results;
  } catch (err) {
    throw new Error(`Cannot read directory ${dirPath}: ${err instanceof Error ? err.message : String(err)}`);
  }
}
