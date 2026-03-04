/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      animation: {
        'spin-slow':    'spin 8s linear infinite',
        'float':        'float 6s ease-in-out infinite',
        'float-slow':   'float 10s ease-in-out infinite',
        'pulse-glow':   'pulse-glow 3s ease-in-out infinite',
        'wave':         'wave 1.4s ease-in-out infinite',
        'shimmer':      'shimmer 2.5s linear infinite',
        'particle':     'particle-rise 8s ease-in infinite',
        'morph':        'morph 8s ease-in-out infinite',
        'bounce-soft':  'bounce-soft 2s ease-in-out infinite',
        'slide-up':     'slide-up 0.4s ease-out forwards',
        'fade-in':      'fade-in 0.3s ease-out forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%':       { transform: 'translateY(-12px)' },
        },
        'pulse-glow': {
          '0%, 100%': { boxShadow: '0 0 20px rgba(99,102,241,0.3), 0 0 40px rgba(99,102,241,0.1)' },
          '50%':       { boxShadow: '0 0 40px rgba(99,102,241,0.6), 0 0 80px rgba(99,102,241,0.2)' },
        },
        wave: {
          '0%, 100%': { transform: 'scaleY(0.5)', opacity: '0.5' },
          '50%':       { transform: 'scaleY(1.5)', opacity: '1' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '-200% center' },
          '100%': { backgroundPosition: '200% center' },
        },
        'particle-rise': {
          '0%':   { transform: 'translateY(0) scale(1)', opacity: '0.8' },
          '100%': { transform: 'translateY(-100vh) scale(0)', opacity: '0' },
        },
        morph: {
          '0%, 100%': { borderRadius: '60% 40% 30% 70% / 60% 30% 70% 40%' },
          '50%':       { borderRadius: '30% 60% 70% 40% / 50% 60% 30% 60%' },
        },
        'bounce-soft': {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%':       { transform: 'translateY(-6px)' },
        },
        'slide-up': {
          '0%':   { transform: 'translateY(20px)', opacity: '0' },
          '100%': { transform: 'translateY(0)',    opacity: '1' },
        },
        'fade-in': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
      },
    },
  },
  plugins: [],
};
