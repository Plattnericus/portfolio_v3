import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// Clips keep their file names between deploys, so browsers revalidate (cheap 304s)
// instead of holding on to an old clip.
const revalidate = "public, max-age=0, must-revalidate";

/**
 * Content hash over every model file. The model URLs carry it, so they change
 * exactly when a model does: browsers can keep them for good, and a page never
 * pairs new code with an old model.
 */
// Models are stored gzipped (name.glb.gz) and sent with Content-Encoding: gzip,
// so they arrive compressed on any host, including ones that only compress text.
const models = path.join(process.cwd(), "public", "models");
const glbs = readdirSync(models)
  .filter((f) => f.endsWith(".glb.gz"))
  .sort();

function modelRevision() {
  const hash = createHash("sha1");
  for (const file of glbs) hash.update(file).update(readFileSync(path.join(models, file)));
  return hash.digest("hex").slice(0, 10);
}

/** Sets that ship a light variant (`name.lite.glb.gz`) for phones and weak GPUs. */
const liteModels = glbs.filter((f) => f.endsWith(".lite.glb.gz")).map((f) => f.slice(0, -".lite.glb.gz".length));

const nextConfig: NextConfig = {
  cacheComponents: true,
  partialPrefetching: true,
  devIndicators: false,
  poweredByHeader: false,
  env: {
    NEXT_PUBLIC_MODEL_REV: modelRevision(),
    NEXT_PUBLIC_MODEL_LITE: liteModels.join(","),
  },
  async headers() {
    return [
      {
        source: "/models/:file*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Content-Type", value: "model/gltf-binary" },
          { key: "Content-Encoding", value: "gzip" },
        ],
      },
      { source: "/work/:file*", headers: [{ key: "Cache-Control", value: revalidate }] },
      {
        source: "/:path*",
        headers: [
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
    ];
  },
};

export default nextConfig;
