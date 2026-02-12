/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./index.html', './admin.html', './*.html', './blog/**/*.html', './js/**/*.js'],
  darkMode: 'class',
  theme: {
    extend: {
      fontFamily: {
        sans: ['Heebo', 'sans-serif'],
      },
      colors: {
        neutral: {
          light: '#fafafa',
          DEFAULT: '#2b2b2f',
          dark: '#1c1c1e'
        },
        brand: {
          500: '#00D4FF',
          600: '#0099CC',
          accent: '#FF3366'
        }
      },
      boxShadow: {
        card: '0 4px 15px rgba(0,0,0,0.35)',
      }
    }
  },
  plugins: []
}
