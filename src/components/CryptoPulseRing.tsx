'use client';

import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { Shield, Lock, CheckCircle2 } from 'lucide-react';

interface CryptoPulseRingProps {
  score: number;
  size?: number;
  showLabel?: boolean;
}

export default function CryptoPulseRing({ score, size = 180, showLabel = true }: CryptoPulseRingProps) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const radius = (size - 20) / 2;
  const circumference = 2 * Math.PI * radius;
  const strokeDashoffset = circumference - (score / 100) * circumference;
  const center = size / 2;

  const getColor = () => {
    if (score >= 90) return { primary: '#00e676', secondary: '#00e5ff', label: 'Fortress' };
    if (score >= 70) return { primary: '#00e5ff', secondary: '#3d5afe', label: 'Secure' };
    if (score >= 50) return { primary: '#ffab00', secondary: '#ff9100', label: 'Moderate' };
    return { primary: '#ff1744', secondary: '#ff5252', label: 'At Risk' };
  };
  const color = getColor();

  if (!mounted) return <div style={{ width: size, height: size }} />;

  return (
    <div className="relative flex flex-col items-center" style={{ width: size, height: size + (showLabel ? 30 : 0) }}>
      {/* Pulse rings */}
      {[1, 2, 3].map(i => (
        <motion.div
          key={i}
          className="absolute rounded-full border"
          style={{
            width: size - 10,
            height: size - 10,
            top: 5,
            left: 5,
            borderColor: color.primary,
            opacity: 0,
          }}
          animate={{
            scale: [1, 1.15 + i * 0.05],
            opacity: [0.3, 0],
          }}
          transition={{
            duration: 2.5,
            repeat: Infinity,
            delay: i * 0.6,
            ease: 'easeOut',
          }}
        />
      ))}

      {/* SVG Ring */}
      <svg width={size} height={size} className="transform -rotate-90">
        <defs>
          <linearGradient id="scoreGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={color.primary} />
            <stop offset="100%" stopColor={color.secondary} />
          </linearGradient>
          <filter id="glow">
            <feGaussianBlur stdDeviation="3" result="coloredBlur" />
            <feMerge>
              <feMergeNode in="coloredBlur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        {/* Background ring */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="rgba(255,255,255,0.04)"
          strokeWidth="6"
        />

        {/* Score ring */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="url(#scoreGradient)"
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset }}
          transition={{ duration: 1.5, ease: 'easeInOut' }}
          filter="url(#glow)"
        />
      </svg>

      {/* Center content */}
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ height: size }}>
        <motion.div
          initial={{ scale: 0 }}
          animate={{ scale: 1 }}
          transition={{ delay: 0.3, type: 'spring', stiffness: 200 }}
        >
          {score >= 90 ? (
            <CheckCircle2 className="w-6 h-6 mb-1" style={{ color: color.primary }} />
          ) : score >= 50 ? (
            <Shield className="w-6 h-6 mb-1" style={{ color: color.primary }} />
          ) : (
            <Lock className="w-6 h-6 mb-1" style={{ color: color.primary }} />
          )}
        </motion.div>
        <motion.span
          className="text-3xl font-bold tracking-tight"
          style={{ color: color.primary }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.5 }}
        >
          {score}
        </motion.span>
        <span className="text-[10px] text-vault-muted uppercase tracking-widest mt-0.5">Trust Score</span>
      </div>

      {/* Label */}
      {showLabel && (
        <motion.div
          initial={{ opacity: 0, y: 5 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.8 }}
          className="mt-2 px-3 py-1 rounded-full text-[11px] font-medium tracking-wide"
          style={{
            background: `${color.primary}15`,
            color: color.primary,
            border: `1px solid ${color.primary}30`,
          }}
        >
          {color.label} Grade
        </motion.div>
      )}
    </div>
  );
}
