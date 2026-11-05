"use client";

import Image from "next/image";
import { useState } from "react";

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
  const [failedLogoUrl, setFailedLogoUrl] = useState<string | null>(null);
  const [failedNameImageUrl, setFailedNameImageUrl] = useState<string | null>(
    null,
  );
  const displayLogoUrl = logoUrl?.trim() || null;
  const displayNameImageUrl = nameImageUrl?.trim() || null;

  return (
    <div className="flex min-w-0 items-center gap-1.5">
      {displayLogoUrl && failedLogoUrl !== displayLogoUrl ? (
        <Image
          alt={`${name}校徽`}
          className="h-8 w-8 shrink-0 rounded-full object-contain"
          height={32}
          loading="eager"
          onError={() => setFailedLogoUrl(displayLogoUrl)}
          src={displayLogoUrl}
          unoptimized
          width={32}
        />
      ) : (
        <span
          aria-hidden="true"
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-900 text-xs font-semibold text-white"
        >
          {name.trim().slice(0, 1) || "校"}
        </span>
      )}
      {displayNameImageUrl && failedNameImageUrl !== displayNameImageUrl ? (
        <Image
          alt={`${name}校名`}
          className={
            compact
              ? "h-10 w-[min(10rem,44vw)] shrink object-contain object-left mix-blend-multiply"
              : "h-9 w-[min(13rem,48vw)] shrink object-contain object-left mix-blend-multiply"
          }
          height={40}
          loading="eager"
          onError={() => setFailedNameImageUrl(displayNameImageUrl)}
          src={displayNameImageUrl}
          unoptimized
          width={compact ? 160 : 220}
        />
      ) : (
        <span
          className="truncate text-base font-semibold text-blue-950 sm:text-lg"
          style={{
            fontFamily:
              '"STKaiti", "KaiTi", "楷体", "Noto Serif CJK SC", serif',
            letterSpacing: "0.08em",
          }}
        >
          {name}
        </span>
      )}
    </div>
  );
}
