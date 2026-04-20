/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,js,html}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          primary: 'var(--brand-primary)',
          secondary: 'var(--brand-secondary)',
          'bg-dark': 'var(--brand-bg-dark)',
          'bg-light': 'var(--brand-bg-light)',
          'surface-dark': 'var(--brand-surface-dark)',
          'surface-light': 'var(--brand-surface-light)',
          'text-dark': 'var(--brand-text-dark)',
          'text-light': 'var(--brand-text-light)'
        }
      },
      borderRadius: {
        brand: 'var(--brand-radius)'
      },
      fontFamily: {
        brand: 'var(--brand-font)'
      }
    }
  },
  plugins: []
}
