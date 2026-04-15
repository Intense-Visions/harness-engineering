import { motion, useAnimation } from 'framer-motion';
import { useEffect, useState } from 'react';

export function NeuralDecryptionLoader() {
  // Enhanced lattice points (Central focus)
  const points = [
    { x: 50, y: 15 },
    { x: 80, y: 30 },
    { x: 80, y: 70 },
    { x: 50, y: 85 },
    { x: 20, y: 70 },
    { x: 20, y: 30 },
    { x: 50, y: 50 }, // Core
  ];

  const connections = [
    [0, 1],
    [1, 2],
    [2, 3],
    [3, 4],
    [4, 5],
    [5, 0],
    [0, 6],
    [1, 6],
    [2, 6],
    [3, 6],
    [4, 6],
    [5, 6],
  ];

  // Particle data packets
  const packets = Array.from({ length: 15 }).map((_, i) => ({
    id: i,
    connection: i % connections.length,
    delay: Math.random() * 5,
    duration: 2 + Math.random() * 2,
    size: 0.5 + Math.random() * 1.5,
  }));

  // Background Hex Grid
  const hexGrid = Array.from({ length: 4 }).map((_, i) => (
    <motion.path
      key={`grid-${i}`}
      d="M 50 5 L 90 25 L 90 75 L 50 95 L 10 75 L 10 25 Z"
      fill="none"
      stroke="var(--color-primary-500)"
      strokeWidth="0.05"
      strokeOpacity="0.05"
      initial={{ scale: 0.5 + i * 0.2, rotate: i * 30 }}
      animate={{ rotate: i % 2 === 0 ? 360 : -360 }}
      transition={{ duration: 30 + i * 10, repeat: Infinity, ease: 'linear' }}
    />
  ));

  return (
    <div className="relative w-80 h-80 flex items-center justify-center select-none pointer-events-none">
      {/* 1. Volumetric Atmosphere */}
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_center,rgba(79,70,229,0.2),transparent_75%)] rounded-full animate-pulse" />
      <div className="absolute inset-4 bg-[radial-gradient(circle_at_center,rgba(34,211,238,0.1),transparent_60%)] rounded-full animate-glow" />
      <div className="absolute inset-0 bg-[conic-gradient(from_0deg,transparent,rgba(34,211,238,0.03),transparent)] rounded-full animate-[spin_12s_linear_infinite]" />

      {/* 2. Main Neural Engine */}
      <svg viewBox="0 0 100 100" className="w-full h-full relative z-10 overflow-visible">
        <defs>
          <filter id="ultra-glow" x="-100%" y="-100%" width="300%" height="300%">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feComposite in="SourceGraphic" in2="blur" operator="over" />
          </filter>

          <linearGradient id="neural-gradient-v3" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--color-primary-500)" />
            <stop offset="100%" stopColor="var(--color-secondary-400)" />
          </linearGradient>

          <mask id="scanning-light-mask">
            <motion.rect
              width="100"
              height="100"
              fill="white"
              animate={{ x: [-100, 100] }}
              transition={{ duration: 4, repeat: Infinity, ease: 'linear' }}
            />
          </mask>
        </defs>

        {/* --- Background Plane --- */}
        <g opacity="0.15">{hexGrid}</g>

        {/* --- Mid Plane: Circuitry Branching --- */}
        <g stroke="var(--color-primary-500)" strokeWidth="0.2" fill="none" opacity="0.3">
          {points.map((p, i) => (
            <motion.path
              key={`branch-${i}`}
              d={`M ${p.x} ${p.y} L ${p.x + (i % 2 ? 5 : -5)} ${p.y + (i > 3 ? 5 : -5)} L ${p.x + (i % 2 ? 8 : -8)} ${p.y + (i > 3 ? 5 : -5)}`}
              initial={{ pathLength: 0 }}
              animate={{ pathLength: [0, 1, 0] }}
              transition={{ duration: 4, repeat: Infinity, delay: i * 0.5 }}
            />
          ))}
        </g>

        {/* --- Scanning Beam --- */}
        <motion.circle
          cx="50"
          cy="50"
          r="45"
          fill="none"
          stroke="rgba(34,211,238,0.05)"
          strokeWidth="10"
          strokeDasharray="40 100"
          animate={{ rotate: 360 }}
          transition={{ duration: 5, repeat: Infinity, ease: 'linear' }}
        />

        {/* --- Connection Mesh --- */}
        {connections.map(([a, b], i) => (
          <g key={`mesh-group-${i}`}>
            {/* Background static line */}
            <line
              x1={points[a].x}
              y1={points[a].y}
              x2={points[b].x}
              y2={points[b].y}
              stroke="var(--color-primary-500)"
              strokeWidth="0.2"
              strokeOpacity="0.1"
            />
            {/* Active flow highlights */}
            <motion.line
              x1={points[a].x}
              y1={points[a].y}
              x2={points[b].x}
              y2={points[b].y}
              stroke="url(#neural-gradient-v3)"
              strokeWidth="0.5"
              strokeOpacity="0.4"
              initial={{ pathLength: 0 }}
              animate={{ pathLength: [0, 1, 0] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.2 }}
            />
          </g>
        ))}

        {/* --- Data Packet Flow --- */}
        {packets.map((p) => {
          const start = points[connections[p.connection][0]];
          const end = points[connections[p.connection][1]];
          return (
            <motion.rect
              key={`packet-${p.id}`}
              width={p.size}
              height="0.4"
              fill="var(--color-secondary-400)"
              filter="url(#ultra-glow)"
              animate={{
                x: [start.x, end.x],
                y: [start.y, end.y],
                opacity: [0, 1, 0],
                rotate: Math.atan2(end.y - start.y, end.x - start.x) * (180 / Math.PI),
              }}
              transition={{
                duration: p.duration,
                repeat: Infinity,
                delay: p.delay,
                ease: 'linear',
              }}
            />
          );
        })}

        {/* --- Foreground: Kinetic Hex Nodes --- */}
        {points.map((p, i) => (
          <g key={`node-v3-${i}`}>
            {/* Outer Hex Frame */}
            <motion.path
              d="M -3 0 L -1.5 -2.6 L 1.5 -2.6 L 3 0 L 1.5 2.6 L -1.5 2.6 Z"
              transform={`translate(${p.x}, ${p.y})`}
              fill="rgba(9,9,11,0.8)"
              stroke={i === 6 ? 'var(--color-secondary-400)' : 'var(--color-primary-500)'}
              strokeWidth="0.4"
              initial={{ rotate: 0 }}
              animate={{
                rotate: [0, 360],
                scale: [1, 1.1, 1],
                strokeOpacity: [0.4, 1, 0.4],
              }}
              transition={{ duration: 6, repeat: Infinity, delay: i * 0.3 }}
            />
            {/* Inner "Data Core" */}
            <motion.circle
              cx={p.x}
              cy={p.y}
              r="0.8"
              fill="var(--color-secondary-400)"
              animate={{ opacity: [0.2, 1, 0.2] }}
              transition={{ duration: 2, repeat: Infinity, delay: i * 0.4 }}
            />
          </g>
        ))}

        {/* --- Tactical HUD Overlays --- */}
        <g transform="translate(50, 50)">
          {/* Ticks & Rulers */}
          {Array.from({ length: 12 }).map((_, i) => (
            <motion.line
              key={`tick-${i}`}
              x1="42"
              y1="0"
              x2="44"
              y2="0"
              stroke="var(--color-neutral-muted)"
              strokeWidth="0.2"
              transform={`rotate(${i * 30})`}
              animate={{ opacity: [0.2, 0.5, 0.2] }}
              transition={{ duration: 3, repeat: Infinity, delay: i * 0.1 }}
            />
          ))}
          {/* Degree Markers */}
          {['00', '90', '18', '27'].map((deg, i) => (
            <text
              key={`deg-${i}`}
              x="36"
              y="1"
              fontSize="2"
              fontFamily="monospace"
              fill="var(--color-neutral-muted)"
              transform={`rotate(${i * 90})`}
              className="font-bold opacity-30"
            >
              {deg}
            </text>
          ))}
        </g>

        {/* --- Periodic Pulse Ripple --- */}
        <motion.circle
          cx="50"
          cy="50"
          r="0"
          fill="none"
          stroke="var(--color-secondary-400)"
          strokeWidth="0.5"
          animate={{ r: [0, 60], opacity: [0, 0.3, 0] }}
          transition={{ duration: 4, repeat: Infinity, delay: 2, ease: 'easeOut' }}
        />

        {/* --- Binary HUD Scrap --- */}
        <text
          x="50"
          y="98"
          fontSize="2"
          textAnchor="middle"
          fontFamily="monospace"
          fill="var(--color-neutral-muted)"
          className="uppercase tracking-[0.4em] opacity-40"
        >
          <motion.tspan
            animate={{ opacity: [0.3, 1, 0.3] }}
            transition={{ duration: 0.5, repeat: Infinity, repeatType: 'reverse' }}
          >
            Encryption Established // Level 7
          </motion.tspan>
        </text>
      </svg>

      {/* 3. Volumetric Heartbeat */}
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-primary-500/10 blur-[15px] animate-pulse" />
    </div>
  );
}
