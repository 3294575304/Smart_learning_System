import sharp from "sharp";

export class SchoolImageNormalizationError extends Error {}

export async function normalizeSchoolImage(
  data: Buffer,
  kind: "logo" | "nameImage",
): Promise<Buffer> {
  try {
    const { data: pixels, info } = await sharp(data, {
      limitInputPixels: 16_000_000,
    })
      .autoOrient()
      .resize({
        width: 1600,
        height: 1600,
        fit: "inside",
        withoutEnlargement: true,
      })
      .toColourspace("srgb")
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    let left = info.width,
      top = info.height,
      right = -1,
      bottom = -1;
    // Measure visible ink rather than the file canvas so white/transparent margins
    // do not make an emblem look smaller than the school lettering.
    for (let y = 0; y < info.height; y++) {
      for (let x = 0; x < info.width; x++) {
        const offset = (y * info.width + x) * 4;
        if (
          pixels[offset + 3] > 24 &&
          Math.min(pixels[offset], pixels[offset + 1], pixels[offset + 2]) < 245
        ) {
          left = Math.min(left, x);
          right = Math.max(right, x);
          top = Math.min(top, y);
          bottom = Math.max(bottom, y);
        }
      }
    }
    if (right < left || bottom < top)
      throw new SchoolImageNormalizationError(
        "图片没有可识别的校徽或校名内容，请更换图片。",
      );
    return await sharp(pixels, {
      raw: { width: info.width, height: info.height, channels: 4 },
    })
      .extract({ left, top, width: right - left + 1, height: bottom - top + 1 })
      .resize({
        width: kind === "logo" ? 128 : 640,
        height: 128,
        fit: kind === "logo" ? "contain" : "inside",
        background: { r: 255, g: 255, b: 255, alpha: 0 },
      })
      .png()
      .toBuffer();
  } catch (error: unknown) {
    if (error instanceof SchoolImageNormalizationError) throw error;
    throw new SchoolImageNormalizationError(
      "图片无法解析或尺寸过大，请更换 PNG、JPG 或 WebP 图片。",
    );
  }
}
