import { MAX_BACKGROUND_BASE64, MAX_FAVICON_BASE64 } from "./core";

export interface ImageCodec {
  normalizeFavicon(dataUrl: string): Promise<{ dataUrl: string; source: "custom"; fetchedAt: string }>;
  compressImage(dataUrl: string): Promise<string>;
}

const TARGET_BACKGROUND_BASE64 = 500 * 1024;
const BACKGROUND_DIMS = [1920, 1600, 1280] as const;
const BACKGROUND_QUALITIES = [0.8, 0.72, 0.64] as const;

function canEncodeWebP(): boolean {
  try {
    const probe = document.createElement("canvas");
    probe.width = 1;
    probe.height = 1;
    return probe.toDataURL("image/webp").startsWith("data:image/webp");
  } catch {
    return false;
  }
}

function scaledSize(width: number, height: number, maxDim: number): { width: number; height: number } {
  const scale = Math.min(1, maxDim / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function drawScaled(img: HTMLImageElement, mime: string, quality: number, maxDim: number): string {
  const { width, height } = scaledSize(img.naturalWidth, img.naturalHeight, maxDim);
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas 2D unavailable");
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(img, 0, 0, width, height);
  return canvas.toDataURL(mime, quality);
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

  async compressImage(dataUrl: string) {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("Could not load image"));
      img.src = dataUrl;
    });

    const mime = canEncodeWebP() ? "image/webp" : "image/jpeg";
    let best: string | null = null;
    for (const maxDim of BACKGROUND_DIMS) {
      for (const quality of BACKGROUND_QUALITIES) {
        const out = drawScaled(img, mime, quality, maxDim);
        if (out.length <= TARGET_BACKGROUND_BASE64) return out;
        if (best === null || out.length < best.length) best = out;
      }
    }

    if (best === null || best.length > MAX_BACKGROUND_BASE64) {
      throw new Error("This image is too large to use as a background (over 700 KB after compression).");
    }
    return best;
  },
};
