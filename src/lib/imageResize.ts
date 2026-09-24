"use client";

// Shrinks a photo so its longest side is at most `max` pixels and re-encodes it.
// WebP where the browser can make it (Chrome, newer Safari), otherwise JPEG.
export async function resizeImage(file: Blob, max = 800, quality = 0.82): Promise<Blob> {
  const bitmap = await createImageBitmap(file, { imageOrientation: "from-image" }).catch(() => null);
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;
  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    // Older Safari: fall back to an <img> element.
    const url = URL.createObjectURL(file);
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = () => reject(new Error("That file isn't a picture we can read."));
      el.src = url;
    });
    URL.revokeObjectURL(url);
    width = img.naturalWidth;
    height = img.naturalHeight;
    draw = (ctx, w, h) => ctx.drawImage(img, 0, 0, w, h);
  }
  const scale = Math.min(1, max / Math.max(width, height));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This device can't process pictures.");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, w, h);
  draw(ctx, w, h);
  bitmap?.close();
  const encode = (type: string) =>
    new Promise<Blob | null>((resolve) => canvas.toBlob((b) => resolve(b), type, quality));
  const webp = await encode("image/webp");
  if (webp && webp.type === "image/webp") return webp;
  const jpeg = await encode("image/jpeg");
  if (!jpeg) throw new Error("Couldn't compress the picture.");
  return jpeg;
}
