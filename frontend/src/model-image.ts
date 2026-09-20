import { anatomyAssets } from "@/src/anatomy-assets";
import type { AnatomyModel } from "@/src/api";

/**
 * Resolve the artwork for an anatomy model.
 * Prefer the admin-supplied image_url. Fall back to the built-in SVG map keyed
 * by the model name (matching legacy "lungs", "heart", "liver", "kidney").
 */
export function resolveModelImage(model: AnatomyModel): string | null {
  if (model.image_url && model.image_url.trim()) return model.image_url;
  const key = model.name.trim().toLowerCase().replace(/s$/, "");
  return anatomyAssets[key] ?? anatomyAssets[model.name.toLowerCase()] ?? null;
}
