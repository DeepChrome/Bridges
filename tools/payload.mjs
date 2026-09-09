/* The native payload, read back as one object.
 *
 * build_site.py writes it in four files — data.json and, beside it, the parts the
 * app loads on first use (deep, sent, videos; NATIVE_PARTS there). The tools that
 * stand in for the app want the whole thing, so they read it through here rather
 * than each knowing the split.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const PARTS = ["deep", "sent", "videos"];

export function loadPayload(root) {
  const dir = join(root, "native", "assets");
  const data = JSON.parse(readFileSync(join(dir, "data.json"), "utf8"));
  for (const part of PARTS) {
    const file = join(dir, part + ".json");
    if (existsSync(file)) data[part] = JSON.parse(readFileSync(file, "utf8"));
  }
  return data;
}
