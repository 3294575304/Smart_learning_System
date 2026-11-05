import { readFile, writeFile, mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";

// Run: node scripts/generate-china-showcase-map.mjs .data/china-provinces-source.json
// Source: https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json
const source = await readFile(
  process.argv[2] ?? ".data/china-provinces-source.json",
  "utf8",
);
const geo = JSON.parse(source);
if (geo.type !== "FeatureCollection" || geo.features.length !== 35)
  throw new Error("Unexpected China boundary dataset");
const rad = Math.PI / 180;
const n = (Math.sin(25 * rad) + Math.sin(47 * rad)) / 2;
const c = Math.cos(25 * rad) ** 2 + 2 * n * Math.sin(25 * rad);
const rho0 = Math.sqrt(c - 2 * n * Math.sin(35 * rad)) / n;
function albers([lon, lat]) {
  const rho = Math.sqrt(c - 2 * n * Math.sin(lat * rad)) / n;
  const theta = n * (lon - 105) * rad;
  return [rho * Math.sin(theta), rho * Math.cos(theta) - rho0];
}
function rings(feature) {
  if (feature.geometry.type === "Polygon") return feature.geometry.coordinates;
  if (feature.geometry.type === "MultiPolygon")
    return feature.geometry.coordinates.flat();
  throw new Error("Unsupported map geometry");
}
const regions = geo.features.filter((f) => f.properties.level === "province");
const points = regions
  .flatMap(rings)
  .flat()
  .filter(([, lat]) => lat >= 18)
  .map(albers);
const xs = points.map(([x]) => x),
  ys = points.map(([, y]) => y);
const bounds = [
  Math.min(...xs),
  Math.min(...ys),
  Math.max(...xs),
  Math.max(...ys),
];
const scale = Math.min(
  900 / (bounds[2] - bounds[0]),
  615 / (bounds[3] - bounds[1]),
);
const ox = (1000 - (bounds[2] - bounds[0]) * scale) / 2;
const main = (point) => {
  const [x, y] = albers(point);
  return [ox + (x - bounds[0]) * scale, 28 + (y - bounds[1]) * scale];
};
const merc = (lat) => Math.log(Math.tan(Math.PI / 4 + (lat * rad) / 2));
const inset = ([lon, lat]) => [
  810 + ((lon - 105) / 20) * 155,
  515 + ((merc(23) - merc(lat)) / (merc(23) - merc(3))) * 175,
];
const rounded = (point) => point.map((value) => Math.round(value * 100) / 100);
function path(feature, projection) {
  return rings(feature)
    .map(
      (ring) =>
        ring
          .map(
            (point, i) =>
              `${i === 0 ? "M" : "L"}${rounded(projection(point)).join(",")}`,
          )
          .join("") + "Z",
    )
    .join("");
}
const centers = { 130000: [115, 38], 620000: [102.8, 38] };
const offsets = {
  110000: [-22, -24],
  120000: [38, -4],
  310000: [37, 10],
  810000: [62, 16],
  820000: [-7, 42],
};
const short = {
  150000: "内蒙古",
  450000: "广西",
  540000: "西藏",
  640000: "宁夏",
  650000: "新疆",
  810000: "香港",
  820000: "澳门",
};
const provinces = regions.map((feature) => {
  const code = String(feature.properties.adcode);
  const center = rounded(
    main(
      centers[code] ?? feature.properties.centroid ?? feature.properties.center,
    ),
  );
  const offset = offsets[code] ?? [0, 0];
  return {
    code,
    name: feature.properties.name,
    shortName: short[code] ?? feature.properties.name.replace(/[省市]$/, ""),
    center,
    capital: rounded(main(feature.properties.center)),
    label: rounded([center[0] + offset[0], center[1] + offset[1]]),
    path: path(feature, main),
    insetPath: path(feature, inset),
  };
});
const maritime = geo.features.find((f) => f.properties.adchar === "JD");
if (!maritime || provinces.length !== 34)
  throw new Error("Incomplete national map");
await mkdir("data/maps", { recursive: true });
await mkdir("services/schools", { recursive: true });
await writeFile(
  "data/maps/china-provinces.json",
  JSON.stringify({
    source: "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
    sourceSha256: createHash("sha256").update(source).digest("hex"),
    width: 1000,
    height: 730,
    provinces,
    maritimePath: path(maritime, main),
    maritimeInsetPath: path(maritime, inset),
  }) + "\n",
);
await writeFile(
  "services/schools/provinces-data.json",
  JSON.stringify(
    provinces.map(({ code, name, shortName }) => ({ code, name, shortName })),
    null,
    2,
  ) + "\n",
);
console.info(
  `Generated ${provinces.length} provinces and preserved maritime geometry.`,
);
