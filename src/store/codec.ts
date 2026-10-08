import { MAX_FAVICON_BASE64 } from "./core";

export interface ImageCodec {
  normalizeFavicon(dataUrl: string): Promise<{ dataUrl: string; source: "custom"; fetchedAt: string }>;
}

/**
 * Browser-only canvas codec: draws a source image into a 32×32 canvas and
 * re-encodes it as PNG, rejecting oversized output. NOT unit-tested (no canvas
 * in the Vitest node environment).
 */
export const browserCodec: ImageCodec = {
  async normalizeFavicon(dataUrl: string) {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = dataUrl;
    });

    const canvas = document.createElement("canvas");
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D unavailable");
    ctx.drawImage(img, 0, 0, 32, 32);

    const out = canvas.toDataURL("image/png");
    if (out.length > MAX_FAVICON_BASE64) {
      throw new Error("Favicon exceeds 8 KB");
    }
    return { dataUrl: out, source: "custom" as const, fetchedAt: new Date().toISOString() };
  },
};
