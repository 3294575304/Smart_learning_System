"use client";

import { useId } from "react";
import map from "@/data/maps/china-provinces.json";
import { provinceFill } from "@/services/super-admin/showcase-metrics";
import styles from "./showcase.module.css";

interface ChinaMapProps {
  counts: Record<string, number>;
  maxCount: number;
  selected: string;
  onSelect: (code: string) => void;
  onHover: (code: string | null) => void;
}

export function ChinaMap({
  counts,
  maxCount,
  selected,
  onSelect,
  onHover,
}: ChinaMapProps) {
  const uid = useId().replace(/:/g, "");
  const active = map.provinces.find((province) => province.code === selected);
  return (
    <svg
      viewBox="0 0 1000 730"
      className={styles.map}
      role="group"
      aria-label="中国各省级地区系统使用高校分布，点击省份查看高校列表"
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
              stroke={selected === province.code ? "#6b9fb9" : "#c1d4e1"}
              strokeWidth={selected === province.code ? 1.15 : 0.6}
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
              onFocus={() => onHover(province.code)}
              onBlur={() => onHover(null)}
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
            fill="#98afbe"
            stroke="#98afbe"
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
            >
              {province.label[0] !== province.center[0] ||
              province.label[1] !== province.center[1] ? (
                <path
                  d={`M${province.center.join(",")}L${province.label.join(",")}`}
                  stroke="#a2bbcd"
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
                  (counts[province.code] ?? 0) / maxCount > 0.55
                    ? "#fff"
                    : "#47687e"
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
        {active ? (
          <g pointerEvents="none" aria-hidden="true">
            <circle
              cx={active.center[0]}
              cy={(active.center[1] ?? 0) - 18}
              r="7"
              fill="white"
              stroke="#6a9fbb"
              strokeWidth="1.5"
            />
            <circle
              cx={active.center[0]}
              cy={(active.center[1] ?? 0) - 18}
              r="3"
              fill="#3684aa"
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
        fill="#f6fafc"
        stroke="#c9dce8"
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
          fill="#98afbe"
          stroke="#98afbe"
          strokeWidth="0.5"
        />
      </g>
      <text x="888" y="719" textAnchor="middle" fill="#7d99ab" fontSize="12">
        南海诸岛
      </text>
    </svg>
  );
}
