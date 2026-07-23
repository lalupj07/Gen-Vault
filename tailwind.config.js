/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        vault: {
          black: 'var(--vault-black)',
          darker: 'var(--vault-darker)',
          dark: 'var(--vault-dark)',
          panel: 'var(--vault-panel)',
          card: 'var(--vault-card)',
          border: 'var(--vault-border)',
          hover: 'var(--vault-hover)',
          muted: 'var(--vault-muted)',
          text: 'var(--vault-text)',
          light: 'var(--vault-light)',
        },
        cyber: {
          cyan: 'var(--cyber-cyan)',
          cyanDim: '#00a8bd',
          blue: 'var(--cyber-blue)',
          indigo: '#536dfe',
          emerald: 'var(--cyber-emerald)',
          emeraldDim: '#00b85c',
          purple: 'var(--cyber-purple)',
          pink: '#ff4081',
          amber: '#ffab00',
          red: '#ff1744',
        },
        accent: {
          primary: 'var(--cyber-cyan)',
          secondary: 'var(--cyber-purple)',
          success: 'var(--cyber-emerald)',
          warning: '#ffab00',
          danger: '#ff1744',
        },
      },
      fontFamily: {
        sans: ['Segoe UI Variable', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono: ['Cascadia Code', 'JetBrains Mono', 'Fira Code', 'monospace'],
        display: ['Segoe UI Variable Display', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic': 'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
        'glow-cyan': 'radial-gradient(ellipse at center, rgba(0,229,255,0.15) 0%, transparent 70%)',
        'glow-emerald': 'radial-gradient(ellipse at center, rgba(0,230,118,0.15) 0%, transparent 70%)',
        'glow-purple': 'radial-gradient(ellipse at center, rgba(124,77,255,0.15) 0%, transparent 70%)',
      },
      boxShadow: {
        'glow-sm': '0 0 15px rgba(255,230,0,0.18)',
        'glow-md': '0 0 30px rgba(255,230,0,0.22)',
        'glow-lg': '0 0 60px rgba(255,230,0,0.28)',
        'glow-emerald': '0 0 30px rgba(0,230,118,0.2)',
        'glow-purple': '0 0 30px rgba(255,230,0,0.22)',
        'glow-danger': '0 0 30px rgba(255,23,68,0.2)',
        'inner-glow': 'inset 0 0 30px rgba(255,230,0,0.05)',
        'panel': '0 8px 32px rgba(0,0,0,0.4)',
      },
      animation: {
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'spin-slow': 'spin 8s linear infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'scan': 'scan 3s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
        'fade-in': 'fadeIn 0.5s ease-out',
        'slide-up': 'slideUp 0.5s ease-out',
        'slide-in-right': 'slideInRight 0.3s ease-out',
        'scale-in': 'scaleIn 0.3s ease-out',
        'ring-pulse': 'ringPulse 2s ease-in-out infinite',
      },
      keyframes: {
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '1' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        scan: {
          '0%, 100%': { transform: 'translateY(-100%)' },
          '50%': { transform: 'translateY(100%)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        slideInRight: {
          '0%': { opacity: '0', transform: 'translateX(20px)' },
          '100%': { opacity: '1', transform: 'translateX(0)' },
        },
        scaleIn: {
          '0%': { opacity: '0', transform: 'scale(0.95)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        ringPulse: {
          '0%': { transform: 'scale(1)', opacity: '0.8' },
          '50%': { transform: 'scale(1.05)', opacity: '0.4' },
          '100%': { transform: 'scale(1)', opacity: '0.8' },
        },
      },
      backdropBlur: {
        xs: '2px',
      },
    },
  },
  plugins: [],
};
