'use client'

// 指南针+书本品牌Logo — 纯白色+银色金属质感（适配深色背景）
export default function BrandLogo({ size = 200, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 180 180"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        {/* 银色金属主渐变 */}
        <linearGradient id="silverGrad" x1="0" y1="0" x2="180" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="20%" stopColor="#E8ECF1" />
          <stop offset="50%" stopColor="#F0F2F5" />
          <stop offset="80%" stopColor="#DDE2E8" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
        {/* 浅色渐变 */}
        <linearGradient id="lightSilvGrad" x1="0" y1="0" x2="0" y2="180" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.95" />
          <stop offset="100%" stopColor="#C8CDD4" stopOpacity="0.7" />
        </linearGradient>
        {/* 书本内页渐变 */}
        <linearGradient id="pageGrad" x1="0" y1="0" x2="0" y2="1" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.1" />
        </linearGradient>
        {/* 金属光泽 */}
        <linearGradient id="shimmer" x1="0" y1="0" x2="1" y2="0" gradientUnits="objectBoundingBox">
          <stop offset="0%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="40%" stopColor="#FFFFFF" stopOpacity="0.12" />
          <stop offset="55%" stopColor="#FFFFFF" stopOpacity="0.25" />
          <stop offset="70%" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0" />
        </linearGradient>
        {/* 外发光效果 */}
        <radialGradient id="outerGlow" cx="50%" cy="50%" r="50%">
          <stop offset="60%" stopColor="#FFFFFF" stopOpacity="0" />
          <stop offset="85%" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="100%" stopColor="#FFFFFF" stopOpacity="0.15" />
        </radialGradient>
      </defs>

      {/* 底部外发光 */}
      <circle cx="90" cy="90" r="88" fill="url(#outerGlow)" />

      {/* 外圈装饰环 - 纯白+浅灰描边 */}
      <circle cx="90" cy="90" r="88" stroke="#FFFFFF" strokeWidth="1.5" fill="none" opacity="0.3" />
      <circle cx="90" cy="90" r="86" stroke="#C8CDD4" strokeWidth="0.5" fill="none" opacity="0.25" />
      <circle cx="90" cy="90" r="84" stroke="#FFFFFF" strokeWidth="1" fill="none" opacity="0.15" />

      {/* 圆形背景 - 半透明白色 */}
      <circle cx="90" cy="90" r="78" fill="#FFFFFF" opacity="0.08" />
      <circle cx="90" cy="90" r="78" fill="url(#lightSilvGrad)" opacity="0.06" />

      {/* 金属光泽覆盖 */}
      <circle cx="90" cy="90" r="78" fill="url(#shimmer)" />

      {/* 内圈 */}
      <circle cx="90" cy="90" r="72" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.12" fill="none" />

      {/* ========== 书本（底部） ========== */}
      {/* 书本封面底部 */}
      <path
        d="M40 114 L40 100 Q40 96 44 96 L136 96 Q140 96 140 100 L140 114 Z"
        fill="url(#silverGrad)"
        opacity="0.85"
      />
      {/* 书本封面 */}
      <path
        d="M38 98 L38 100 Q40 96 44 96 L136 96 Q140 96 142 100 L142 98 Q140 94 136 94 L44 94 Q40 94 38 98 Z"
        fill="url(#silverGrad)"
        opacity="0.9"
      />
      {/* 左书页 */}
      <path
        d="M44 96 L90 100 L90 114 L44 114 Z"
        fill="url(#pageGrad)"
      />
      {/* 右书页 */}
      <path
        d="M90 100 L136 96 L136 114 L90 114 Z"
        fill="url(#pageGrad)"
      />
      {/* 书脊 - 中线 */}
      <line x1="90" y1="96" x2="90" y2="114" stroke="#FFFFFF" strokeWidth="0.8" opacity="0.5" />
      {/* 左页面横线装饰 */}
      <line x1="54" y1="102" x2="82" y2="105" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.3" />
      <line x1="54" y1="107" x2="80" y2="109" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.2" />
      {/* 右页面横线装饰 */}
      <line x1="100" y1="105" x2="128" y2="102" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.3" />
      <line x1="102" y1="109" x2="126" y2="107" stroke="#FFFFFF" strokeWidth="0.4" opacity="0.2" />

      {/* ========== 指南针（顶部） ========== */}
      {/* 指南针外圈 */}
      <circle cx="90" cy="72" r="28" fill="none" stroke="url(#silverGrad)" strokeWidth="2.5" opacity="0.85" />
      <circle cx="90" cy="72" r="25" fill="#FFFFFF" opacity="0.06" />
      <circle cx="90" cy="72" r="25" fill="none" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.3" />

      {/* 指南针刻度线 */}
      {[0, 45, 90, 135, 180, 225, 270, 315].map((angle, i) => (
        <line
          key={i}
          x1={90 + 22 * Math.cos((angle - 90) * Math.PI / 180)}
          y1={72 + 22 * Math.sin((angle - 90) * Math.PI / 180)}
          x2={90 + 25 * Math.cos((angle - 90) * Math.PI / 180)}
          y2={72 + 25 * Math.sin((angle - 90) * Math.PI / 180)}
          stroke="#FFFFFF"
          strokeWidth={angle % 90 === 0 ? 1.8 : 0.8}
          opacity={angle % 90 === 0 ? 0.7 : 0.4}
        />
      ))}

      {/* 指南针指针 - 北（上）白色实心 */}
      <polygon
        points="90,48 86,72 90,68 94,72"
        fill="url(#silverGrad)"
        opacity="0.95"
      />
      {/* 指针高光 */}
      <polygon
        points="90,50 89,68 90,66"
        fill="#FFFFFF"
        opacity="0.6"
      />
      {/* 指南针指针 - 南（下）半透明 */}
      <polygon
        points="90,96 86,72 90,76 94,72"
        fill="#FFFFFF"
        opacity="0.35"
      />

      {/* 中心点 */}
      <circle cx="90" cy="72" r="3" fill="#FFFFFF" opacity="0.95" />
      <circle cx="90" cy="72" r="1.5" fill="#C8CDD4" opacity="0.9" />

      {/* N/S/E/W 标记 */}
      <text x="90" y="56" textAnchor="middle" fill="#FFFFFF" fontSize="9" fontWeight="bold" fontFamily="Arial, sans-serif" opacity="0.95">N</text>
      <text x="90" y="92" textAnchor="middle" fill="#FFFFFF" fontSize="8" fontFamily="Arial, sans-serif" opacity="0.5">S</text>
      <text x="112" y="75" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontFamily="Arial, sans-serif" opacity="0.45">E</text>
      <text x="68" y="75" textAnchor="middle" fill="#FFFFFF" fontSize="7" fontFamily="Arial, sans-serif" opacity="0.45">W</text>
    </svg>
  )
}

// 小尺寸Logo（用于侧边栏、顶栏等）— 纯白色金属质感
export function BrandLogoSmall({ size = 28, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id="silverGradSm" x1="0" y1="0" x2="40" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FFFFFF" />
          <stop offset="30%" stopColor="#E8ECF1" />
          <stop offset="70%" stopColor="#DDE2E8" />
          <stop offset="100%" stopColor="#FFFFFF" />
        </linearGradient>
      </defs>
      {/* 圆底 */}
      <circle cx="20" cy="20" r="19" fill="#FFFFFF" opacity="0.08" />
      <circle cx="20" cy="20" r="19" fill="none" stroke="#FFFFFF" strokeWidth="1" opacity="0.3" />
      <circle cx="20" cy="20" r="17" fill="none" stroke="#C8CDD4" strokeWidth="0.4" opacity="0.2" />
      {/* 书本 */}
      <path d="M5 28 L5 24 Q5 22 8 22 L32 22 Q35 22 35 24 L35 28 Z" fill="url(#silverGradSm)" opacity="0.75" />
      <line x1="20" y1="22" x2="20" y2="28" stroke="#FFFFFF" strokeWidth="0.5" opacity="0.5" />
      {/* 指南针 */}
      <circle cx="20" cy="14" r="7" fill="none" stroke="url(#silverGradSm)" strokeWidth="1.2" opacity="0.8" />
      <polygon points="20,8 19,14 20,13 21,14" fill="url(#silverGradSm)" opacity="0.95" />
      <polygon points="20,20 19,14 20,15 21,14" fill="#FFFFFF" opacity="0.3" />
      <circle cx="20" cy="14" r="1" fill="#FFFFFF" />
    </svg>
  )
}