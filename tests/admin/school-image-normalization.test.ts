import assert from "node:assert/strict";
import test from "node:test";
import sharp from "sharp";
import { schoolIdentityLayout } from "../../components/dashboard/school-identity-layout";
import {
  normalizeSchoolImage,
  SchoolImageNormalizationError,
} from "../../services/schools/image-normalization";

async function fixture(width: number, height: number, background: string) {
  return sharp(
    Buffer.from(
      `<svg width="800" height="400" xmlns="http://www.w3.org/2000/svg"><rect width="800" height="400" fill="${background}"/><rect x="100" y="100" width="${width}" height="${height}" fill="#173963"/></svg>`,
    ),
  )
    .png()
    .toBuffer();
}

test("保存校徽时移除外围白边，并保持方形校徽的有效大小", async () => {
  const result = await normalizeSchoolImage(
    await fixture(100, 100, "white"),
    "logo",
  );
  const { data, info } = await sharp(result)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 128);
  assert.equal(info.height, 128);
  assert.ok(data[0] < 100);
  assert.equal(data[3], 255);
  assert.deepEqual(await normalizeSchoolImage(result, "logo"), result);
});

test("长校名保留自然比例，不用统一画布将题字压小", async () => {
  const result = await normalizeSchoolImage(
    await fixture(400, 40, "transparent"),
    "nameImage",
  );
  const { data, info } = await sharp(result)
    .raw()
    .toBuffer({ resolveWithObject: true });
  assert.equal(info.width, 640);
  assert.equal(info.width / info.height, 10);
  assert.ok(data[0] < 100);
  assert.equal(data[3], 255);
});

test("不同校名保持左右横排并适配原格子，不整体压缩校徽", () => {
  for (const ratio of [3.2, 6, 8, 10]) {
    const layout = schoolIdentityLayout(240, ratio, true);
    assert.ok(layout.logoSize >= 32);
    assert.ok(layout.logoSize + layout.gap + layout.nameWidth <= 216);
    assert.ok(Math.abs(layout.nameWidth / layout.nameHeight - ratio) < 0.001);
    assert.ok(Math.max(layout.logoSize, layout.nameHeight) <= 40);
  }
  const short = schoolIdentityLayout(240, 3.2, true);
  assert.ok(short.nameHeight >= 28);
  const long = schoolIdentityLayout(240, 8, true);
  assert.ok(long.nameHeight >= 21);
  assert.ok(long.logoSize >= 36);
});

test("拒绝空白和无法解码的图片", async () => {
  const blank = await sharp({
    create: { width: 100, height: 100, channels: 4, background: "white" },
  })
    .png()
    .toBuffer();
  await assert.rejects(
    normalizeSchoolImage(blank, "logo"),
    SchoolImageNormalizationError,
  );
  await assert.rejects(
    normalizeSchoolImage(Buffer.from("invalid"), "nameImage"),
    SchoolImageNormalizationError,
  );
});
