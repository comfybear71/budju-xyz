import { useMemo, useId } from "react";

interface Point {
  t: string | null;
  b: number;
}

interface AccumulationSparklineProps {
  data: Point[];
  width?: number;
  height?: number;
}

/**
 * Lightweight SVG area chart showing coin accumulation over time.
 * Green gradient if the trend is growing, red if declining.
 * Rendered as a semi-transparent background overlay.
 */
const AccumulationSparkline = ({
  data,
  width = 200,
  height = 50,
}: AccumulationSparklineProps) => {
  const uid = useId();

  const { path, areaPath, isGrowing } = useMemo(() => {
    if (!data || data.length < 2) {
      return { path: "", areaPath: "", isGrowing: true };
    }

    const values = data.map((p) => p.b);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;

    const padding = 2;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = values.map((v, i) => ({
      x: padding + (i / (values.length - 1)) * chartW,
      y: padding + chartH - ((v - min) / range) * chartH,
    }));

    // Line path
    const lineParts = points.map((p, i) =>
      i === 0 ? `M${p.x},${p.y}` : `L${p.x},${p.y}`,
    );
    const linePath = lineParts.join(" ");

    // Area path (close to bottom)
    const areaParts = [
      ...lineParts,
      `L${points[points.length - 1].x},${height}`,
      `L${points[0].x},${height}`,
      "Z",
    ];

    const growing = values[values.length - 1] >= values[0];

    return {
      path: linePath,
      areaPath: areaParts.join(" "),
      isGrowing: growing,
    };
  }, [data, width, height]);

  if (!data || data.length < 2) return null;

  const color = isGrowing ? "#22c55e" : "#ef4444";
  const gradientId = `spark-${uid}`;

  return (
    <svg
      width="100%"
      height="100%"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      className="pointer-events-none"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.6" />
          <stop offset="100%" stopColor={color} stopOpacity="0.08" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth="2"
        strokeOpacity="0.9"
        strokeLinejoin="round"
      />
    </svg>
  );
};

export default AccumulationSparkline;
