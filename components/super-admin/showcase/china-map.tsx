"use client";

import { useId, useState } from "react";
import map from "@/data/maps/china-provinces.json";
import { provinceFill } from "@/services/super-admin/showcase-metrics";
import styles from "./showcase.module.css";

interface ChinaMapProps {
  counts: Record<string, number>;
  maxCount: number;
  selected: string;
  hovered: string | null;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

export function ChinaMap({
  counts,
  maxCount,
  selected,
  hovered,
  onSelect,
  onHover,
}: ChinaMapProps) {
  const uid = useId().replace(/:/g, "");
  const [focused, setFocused] = useState<string | null>(null);
  const active = map.provinces.find((province) => province.code === selected);
  const outlines = [selected, focused, hovered].filter(
    (code, index, codes): code is string =>
      code !== null && codes.lastIndexOf(code) === index,
  );
  return (
    <svg
      viewBox="0 0 1000 730"
      className={styles.map}
      role="group"
      aria-label="中国各省级地区系统使用高校分布，点击省份查看高校列表"
      onPointerLeave={() => onHover(null)}
    >
      <defs>
        <clipPath id={`${uid}-main`}>
          <rect x="0" y="0" width="1000" height="710" />
        </clipPath>
        <clipPath id={`${uid}-inset`}>
          <rect x="810" y="515" width="155" height="175" rx="4" />
        </clipPath>
      </defs>
      <g clipPath={`url(#${uid}-main)`}>
        <g>
          {map.provinces.map((province) => (
            <path
              key={province.code}
              d={province.path}
              fill={provinceFill(counts[province.code] ?? 0, maxCount)}
              fillRule="evenodd"
              stroke="#a9c5bc"
              strokeWidth={0.6}
              strokeLinejoin="round"
              strokeLinecap="round"
              vectorEffect="non-scaling-stroke"
              className={styles.province}
              tabIndex={0}
              role="button"
              aria-label={`${province.name}，${counts[province.code] ?? 0} 所高校`}
              aria-pressed={selected === province.code}
              onClick={() => onSelect(province.code)}
              onPointerEnter={() => onHover(province.code)}
              onPointerLeave={() => onHover(null)}
              onFocus={() => {
                setFocused(province.code);
                onHover(province.code);
              }}
              onBlur={() => {
                setFocused(null);
                onHover(null);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelect(province.code);
                }
              }}
            >
              <title>{`${province.name} · ${counts[province.code] ?? 0} 所高校`}</title>
            </path>
          ))}
          <path
            d={map.maritimePath}
            fill="#91aaa0"
            stroke="#91aaa0"
            strokeWidth="0.5"
            pointerEvents="none"
          />
        </g>
        <g aria-hidden="true">
          {map.provinces.map((province) => (
            <g
              key={province.code}
              className={styles.label}
              onClick={() => onSelect(province.code)}
              onPointerEnter={() => onHover(province.code)}
              onPointerLeave={() => onHover(null)}
            >
              {province.label[0] !== province.center[0] ||
              province.label[1] !== province.center[1] ? (
                <path
                  d={`M${province.center.join(",")}L${province.label.join(",")}`}
                  stroke="#91b1a5"
                  strokeWidth="0.8"
                  fill="none"
                />
              ) : null}
              <text
                x={province.label[0]}
                y={province.label[1]}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize="12"
                fontWeight={selected === province.code ? 700 : 500}
                fill={
                  (counts[province.code] ?? 0) / maxCount > 0.4
                    ? "#fff"
                    : "#3f625b"
                }
                stroke={provinceFill(counts[province.code] ?? 0, maxCount)}
                strokeWidth="2"
                paintOrder="stroke"
              >
                {province.shortName}
              </text>
            </g>
          ))}
        </g>
        {/* Draw interaction outlines last so neighboring fills cannot cover half the stroke. */}
        <g aria-hidden="true" pointerEvents="none">
          {outlines.map((code) => {
            const province = map.provinces.find((item) => item.code === code);
            if (!province) return null;
            const color =
              code === hovered
                ? code === selected
                  ? "#428a79"
                  : "#77a99a"
                : code === focused
                  ? "#337664"
                  : "#428a79";
            return (
              <path
                key={code}
                d={province.path}
                fill="none"
                stroke={color}
                strokeWidth={1.15}
                strokeLinejoin="round"
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
        </g>
        {active ? (
          <g pointerEvents="none" aria-hidden="true">
            <circle
              cx={active.capital[0]}
              cy={active.capital[1]}
              r="7"
              fill="white"
              stroke="#78ad99"
              strokeWidth="1.5"
            />
            <circle
              cx={active.capital[0]}
              cy={active.capital[1]}
              r="3"
              fill="#27866c"
              stroke="white"
              strokeWidth="1.5"
            />
          </g>
        ) : null}
      </g>
      <rect
        x="804"
        y="508"
        width="168"
        height="190"
        rx="7"
        fill="#f4f8f3"
        stroke="#cbdcd2"
      />
      <g clipPath={`url(#${uid}-inset)`} aria-hidden="true">
        {map.provinces.map((province) => (
          <path
            key={province.code}
            d={province.insetPath}
            fill={provinceFill(counts[province.code] ?? 0, maxCount)}
            stroke="#b6cddd"
            strokeWidth="0.5"
            fillRule="evenodd"
          />
        ))}
        <path
          d={map.maritimeInsetPath}
          fill="#91aaa0"
          stroke="#91aaa0"
          strokeWidth="0.5"
        />
      </g>
      <text x="888" y="719" textAnchor="middle" fill="#718d80" fontSize="12">
        南海诸岛
      </text>
    </svg>
  );
}
