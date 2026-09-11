/* The native payload, read back as one object.
 *
 * build_site.py writes data.json and, beside it, the parts the app loads on
 * first use (`NATIVE_PARTS` there). The tools that stand in for the app want the
 * whole thing, so they read it through here rather than each knowing the split.
 *
 * **This list must match `NATIVE_PARTS`.** It is the second copy of that fact,
 * and when a part is added to one and not the other nothing fails: the tools
 * simply see the payload without it, and a check written against that part
 * quietly passes on no data. `senses` was written on 2026-09-11 and added here
 * an hour later, having been missed exactly that way.
 */

import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

export const PARTS = ["deep", "sent", "videos", "listening", "senses"];

export function loadPayload(root) {
  const dir = join(root, "native", "assets");
  const data = JSON.parse(readFileSync(join(dir, "data.json"), "utf8"));
  for (const part of PARTS) {
    const file = join(dir, part + ".json");
    if (existsSync(file)) data[part] = JSON.parse(readFileSync(file, "utf8"));
  }
  return data;
}
