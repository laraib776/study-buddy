import { assets, iconPaths } from '../utils/constants.js';

export default function SafeImage({ src, alt, fallback = 'image', className = '', width, height, style }) {
  const showFallback = !src;

  if (showFallback) {
    return (
      <span
        className={`image-fallback ${className}`.trim()}
        role="img"
        aria-label={alt || 'Image'}
        style={{
          width: width ? `${width}px` : undefined,
          height: height ? `${height}px` : undefined,
          ...style
        }}
      >
        <svg viewBox="0 0 24 24" aria-hidden="true">
          <path d={iconPaths[fallback] || iconPaths.image || iconPaths.star} />
        </svg>
      </span>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={className}
      width={width}
      height={height}
      style={style}
      onError={(event) => {
        event.currentTarget.onerror = null;
        event.currentTarget.src = assets.fallback;
      }}
    />
  );
}
