import Constants from "expo-constants";

import { anatomyAssets } from "@/src/anatomy-assets";
import type { AnatomyModel } from "@/src/api";

const baseUrl =
  Constants.expoConfig?.extra?.backendUrl ??
  process.env.EXPO_PUBLIC_BACKEND_URL ??
  process.env.EXPO_BACKEND_URL ??
  "";

/**
 * Turn a stored image_url into a value the <Image /> component can render.
 * - Relative `/api/files/...` URLs are prefixed with the public backend URL.
 * - Legacy absolute URLs pointing at internal cluster hosts are rewritten to
 *   the current public backend URL, preserving the path + query.
 * - Everything else (https://…, data:…, http://external) is returned as-is.
 */
export function absoluteImageUrl(url: string): string {
  if (!url) return url;
  if (url.startsWith("/api/")) return `${baseUrl}${url}`;
  // Rewrite legacy internal cluster URLs to the current public backend.
  const match = url.match(/^https?:\/\/[^/]+(\/api\/files\/.*)$/);
  if (match) return `${baseUrl}${match[1]}`;
  return url;
}

/**
 * Resolve the artwork for an anatomy model.
 * Prefer the admin-supplied image_url. Fall back to the built-in SVG map keyed
 * by the model name (matching legacy "lungs", "heart", "liver", "kidney").
 */
export function resolveModelImage(model: AnatomyModel): string | null {
  if (model.image_url && model.image_url.trim()) {
    return absoluteImageUrl(model.image_url.trim());
  }
  const key = model.name.trim().toLowerCase().replace(/s$/, "");
  return anatomyAssets[key] ?? anatomyAssets[model.name.toLowerCase()] ?? null;
}
