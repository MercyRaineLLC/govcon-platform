/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/**/*.{js,jsx,ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          gold:        '#f59e0b',
          'gold-light':'#fbbf24',
          'gold-dark': '#d97706',
          'gold-glow': 'rgba(245,158,11,0.15)',
          navy:        '#040d1a',
          'navy-mid':  '#0b1628',
          'navy-card': '#0f1e33',
          'navy-border':'#1a2e4a',
          'navy-hover':'#16263f',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        'gold': '0 0 20px rgba(245,158,11,0.25)',
        'gold-sm': '0 0 10px rgba(245,158,11,0.15)',
        'card': '0 4px 24px rgba(0,0,0,0.4)',
      },
      backgroundImage: {
        'brand-gradient': 'linear-gradient(135deg, #040d1a 0%, #0b1628 50%, #091422 100%)',
        'gold-gradient':  'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        'gold-subtle':    'linear-gradient(135deg, rgba(245,158,11,0.12) 0%, rgba(245,158,11,0.04) 100%)',
      },
    },
  },
  plugins: [],
}
