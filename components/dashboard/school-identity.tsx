"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { schoolIdentityLayout } from "./school-identity-layout";

export function SchoolIdentity({
  name,
  logoUrl,
  nameImageUrl,
  compact = false,
}: {
  name: string;
  logoUrl?: string | null;
  nameImageUrl?: string | null;
  compact?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(224);
  const [imageSize, setImageSize] = useState<{
    url: string;
    ratio: number;
  } | null>(null);
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const [failedNameImageUrl, setFailedNameImageUrl] = useState<string | null>(
    null,
  );
  const displayLogoUrl = logoUrl?.trim() || null;
  const displayNameImageUrl = nameImageUrl?.trim() || null;
  const ratio =
    imageSize?.url === displayNameImageUrl
      ? imageSize.ratio
      : Math.max(2, Array.from(name).length * 0.9);
  const layout = schoolIdentityLayout(width, ratio, compact);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const measure = () => {
      if (container.clientWidth > 0) setWidth(container.clientWidth);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(container);
    measure();
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={containerRef}
      title={name}
      className="flex w-full min-w-0 items-center justify-center"
      style={{ gap: layout.gap }}
    >
      {displayLogoUrl && failedLogoUrl !== displayLogoUrl ? (
        <Image
          alt={`${name}校徽`}
          className="shrink-0 object-contain"
          style={{ width: layout.logoSize, height: layout.logoSize }}
          width={128}
          height={128}
          loading="eager"
          onError={() => setFailedLogoUrl(displayLogoUrl)}
          src={displayLogoUrl}
          unoptimized
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex shrink-0 items-center justify-center rounded-full bg-blue-900 text-base font-semibold text-white"
          style={{ width: layout.logoSize, height: layout.logoSize }}
        >
          {name.trim().slice(0, 1) || "校"}
        </span>
      )}
      {displayNameImageUrl && failedNameImageUrl !== displayNameImageUrl ? (
        <Image
          alt={`${name}校名`}
          className="shrink-0 object-contain object-center mix-blend-multiply"
          style={{ width: layout.nameWidth, height: layout.nameHeight }}
          width={640}
          height={128}
          loading="eager"
          onLoad={(event) => {
            const image = event.currentTarget;
            if (image.naturalWidth && image.naturalHeight)
              setImageSize({
                url: displayNameImageUrl,
                ratio: image.naturalWidth / image.naturalHeight,
              });
          }}
          onError={() => setFailedNameImageUrl(displayNameImageUrl)}
          src={displayNameImageUrl}
          unoptimized
        />
      ) : (
        <span
          className="shrink-0 text-center leading-tight font-semibold whitespace-nowrap text-blue-950"
          style={{
            width: layout.nameWidth,
            fontSize: Math.min(
              24,
              layout.nameWidth / Math.max(1, Array.from(name).length) / 1.08,
            ),
            fontFamily:
              '\"STKaiti\", \"KaiTi\", \"楷体\", \"Noto Serif CJK SC\", serif',
            letterSpacing: "0.04em",
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
