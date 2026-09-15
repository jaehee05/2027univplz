/**
 * 점수를 고리로 보여 준다. 숫자만 있을 때보다 "어느 만큼 받았는지"가 한눈에 들어온다.
 * 인쇄에서도 그대로 나오게 SVG 로 그린다 (배경색 날아감 없음).
 */
export function ScoreRing({
  score,
  max = 100,
  size = 104,
}: {
  score: number;
  max?: number;
  size?: number;
}) {
  const ratio = max > 0 ? Math.max(0, Math.min(1, score / max)) : 0;
  const stroke = Math.round(size * 0.085);
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;

  // 논술은 60점대가 잘 받은 축이라 기준을 시험 감각에 맞춘다.
  const color = ratio >= 0.7 ? "#059669" : ratio >= 0.45 ? "#0284c7" : "#e11d48";

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#f1f5f9"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - ratio)}
          // 12시 방향에서 시작한다.
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span
          className="leading-none font-bold tabular-nums"
          style={{ fontSize: size * 0.3, color }}
        >
          {score}
        </span>
        <span className="mt-0.5 text-xs text-neutral-400">/ {max}</span>
      </div>
    </div>
  );
}
