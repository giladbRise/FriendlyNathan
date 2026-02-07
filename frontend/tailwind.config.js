/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
        display: ['"Bricolage Grotesque"', 'Georgia', 'serif'],
        mono: ['"JetBrains Mono"', '"Fira Code"', 'monospace'],
      },
      animation: {
        'success-pop': 'successPop 0.5s ease-out forwards',
        'checkmark': 'checkmark 0.6s ease-out forwards',
        'fade-in-up': 'fadeInUp 0.4s ease-out forwards',
        'breathe': 'breathe 4s ease-in-out infinite',
        'float': 'float 6s ease-in-out infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
        'blob': 'blob 7s ease-in-out infinite',
        'shimmer': 'shimmer 2s linear infinite',
      },
      boxShadow: {
        'glow-blue': '0 0 15px rgba(59, 130, 246, 0.5)',
        'glow-blue-lg': '0 0 25px rgba(59, 130, 246, 0.6)',
        'glow-green': '0 0 15px rgba(34, 197, 94, 0.5)',
        'glow-red': '0 0 15px rgba(239, 68, 68, 0.5)',
        'glow-peach': '0 0 30px rgba(255, 154, 120, 0.3)',
        'glow-peach-lg': '0 0 50px rgba(255, 154, 120, 0.4)',
        'soft': '0 2px 20px rgba(0, 0, 0, 0.15)',
        'soft-lg': '0 4px 40px rgba(0, 0, 0, 0.2)',
      },
      keyframes: {
        successPop: {
          '0%': { transform: 'scale(0.8)', opacity: '0' },
          '50%': { transform: 'scale(1.05)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
        checkmark: {
          '0%': { transform: 'scale(0) rotate(-45deg)', opacity: '0' },
          '60%': { transform: 'scale(1.2) rotate(0deg)' },
          '100%': { transform: 'scale(1) rotate(0deg)', opacity: '1' },
        },
        fadeInUp: {
          '0%': { transform: 'translateY(10px)', opacity: '0' },
          '100%': { transform: 'translateY(0)', opacity: '1' },
        },
        breathe: {
          '0%, 100%': { transform: 'scale(1)' },
          '50%': { transform: 'scale(1.05)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.4' },
          '50%': { opacity: '0.8' },
        },
        blob: {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '25%': { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
          '50%': { borderRadius: '50% 60% 30% 60% / 40% 70% 60% 50%' },
          '75%': { borderRadius: '40% 50% 60% 50% / 60% 40% 50% 60%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
      },
      borderRadius: {
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      colors: {
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        // Warm palette
        peach: {
          50: '#fff5f0',
          100: '#ffe8db',
          200: '#ffd0b8',
          300: '#ffb08a',
          400: '#ff9a78',
          500: '#ff7a50',
          600: '#e65a30',
          700: '#c04020',
          800: '#9a3318',
          900: '#7d2d16',
        },
        warm: {
          50: '#faf8f5',
          100: '#f3efe8',
          200: '#e8e0d5',
          300: '#d4c8b8',
          400: '#bba898',
          500: '#a08a78',
          600: '#8a7468',
          700: '#6e5d52',
          800: '#5a4d44',
          900: '#4a403a',
        },
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
}
