'use client';

import { useState } from 'react';
import { cn } from '@/lib/utils';
import { issuerIconSrc, issuerMonogram } from '@/lib/issuer-icons';

export function IssuerAvatar({
  issuer,
  className,
}: {
  issuer: string;
  className?: string;
}) {
  const src = issuerIconSrc(issuer);
  const [failed, setFailed] = useState(false);
  const showImg = !!src && !failed;

  return (
    <span
      className={cn(
        'w-10 h-10 rounded-[var(--m3-radius-md)] flex-shrink-0 flex items-center justify-center',
        'bg-[color:var(--md-primary-container)] text-[color:var(--md-on-primary-container)]',
        'overflow-hidden',
        className,
      )}
      aria-hidden
    >
      {showImg ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt=""
          width={24}
          height={24}
          className="w-6 h-6 object-contain opacity-90"
          onError={() => setFailed(true)}
        />
      ) : (
        <span className="text-sm font-semibold tabular-nums">{issuerMonogram(issuer)}</span>
      )}
    </span>
  );
}
