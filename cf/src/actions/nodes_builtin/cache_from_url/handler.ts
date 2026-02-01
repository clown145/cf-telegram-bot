import type { ActionHandler } from "../../handlers";
import { addCacheBuster, buildCacheKey, deriveFilenameFromUrl } from "../../nodeHelpers";

export const handler: ActionHandler = async (params, context) => {
  let url = String(params.url || "");
  if (!url) {
    throw new Error("url is required");
  }

  const noCache = params.no_cache !== false;
  if (noCache) {
    url = addCacheBuster(url);
  }

  if (context.preview) {
    return { file_path: url };
  }

  const bucket = (context.env as any).FILE_BUCKET;
  if (!bucket) {
    return { file_path: url };
  }

  const filename = params.filename ? String(params.filename) : "";
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`download failed: ${response.status} ${response.statusText}`);
  }

  const contentType = response.headers.get("content-type") || "";
  const derivedName = filename || deriveFilenameFromUrl(url);
  const key = buildCacheKey(derivedName, contentType);
  const body = await response.arrayBuffer();

  const putOptions: Record<string, unknown> = {};
  if (contentType) {
    putOptions.httpMetadata = { contentType };
  }
  await bucket.put(key, body, putOptions);

  const r2Path = `r2://${key}`;
  return { file_path: r2Path, temp_files_to_clean: [r2Path] };
};
