interface SpinePathLayerProps {
  isActive: boolean;
}

const spinePath =
  "M60 86 C180 86, 180 86, 300 86 C420 86, 420 86, 540 86 C660 86, 660 86, 780 86 C900 86, 900 86, 1140 86";

export function SpinePathLayer({ isActive }: SpinePathLayerProps) {
  return (
    <svg className="spine-path-layer" viewBox="0 0 1200 180" aria-hidden="true">
      <path className="spine-path-base" d={spinePath} />
      <path className={`spine-path-active ${isActive ? "is-highlighted" : ""}`} d={spinePath} />
    </svg>
  );
}
