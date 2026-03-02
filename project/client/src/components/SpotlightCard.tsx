import React, { useRef, useCallback, useState } from 'react';

interface SpotlightCardProps extends React.PropsWithChildren {
  className?: string;
  spotlightColor?: `rgba(${number}, ${number}, ${number}, ${number})`;
}

const SpotlightCard: React.FC<SpotlightCardProps> = ({
  children,
  className = '',
  spotlightColor = 'rgba(255, 255, 255, 0.25)'
}) => {
  const divRef = useRef<HTMLDivElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [isFocused, setIsFocused] = useState(false);

  const handleMouseMove: React.MouseEventHandler<HTMLDivElement> = useCallback((e) => {
    if (!divRef.current || !overlayRef.current || isFocused) return;
    const rect = divRef.current.getBoundingClientRect();
    overlayRef.current.style.setProperty('--spot-x', `${e.clientX - rect.left}px`);
    overlayRef.current.style.setProperty('--spot-y', `${e.clientY - rect.top}px`);
  }, [isFocused]);

  const setOverlayOpacity = useCallback((value: number) => {
    if (overlayRef.current) overlayRef.current.style.opacity = String(value);
  }, []);

  return (
    <div
      ref={divRef}
      onMouseMove={handleMouseMove}
      onFocus={() => { setIsFocused(true); setOverlayOpacity(0.6); }}
      onBlur={() => { setIsFocused(false); setOverlayOpacity(0); }}
      onMouseEnter={() => setOverlayOpacity(0.6)}
      onMouseLeave={() => setOverlayOpacity(0)}
      className={`relative rounded-3xl border border-neutral-800 bg-neutral-900 overflow-hidden p-8 ${className}`}
    >
      <div
        ref={overlayRef}
        className="pointer-events-none absolute inset-0 transition-opacity duration-500 ease-in-out"
        style={{
          opacity: 0,
          background: `radial-gradient(circle at var(--spot-x, 0px) var(--spot-y, 0px), ${spotlightColor}, transparent 80%)`,
        }}
      />
      {children}
    </div>
  );
};

export default SpotlightCard;
