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
        // Senegalese school green — primary brand colour
        primary: {
          50:  '#E8F5EE',
          100: '#D1EBD9',
          200: '#A3D7B3',
          600: '#0F7B45',
          700: '#075E36',
          800: '#054D2C',
        },
        // Gold accent — used sparingly
        accent: {
          50:  '#FEF9E7',
          300: '#E8C84A',
          400: '#D4A017',
          700: '#92600A',
        },
        // Warm sand — page backgrounds, surface tints
        sand: {
          50:  '#FDFAF5',
          100: '#F7F3EB',
          200: '#EDE8DC',
          300: '#DDD8CE',
        },
      },
      backgroundImage: {
        'gradient-radial': 'radial-gradient(var(--tw-gradient-stops))',
        'gradient-conic':
          'conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))',
      },
    },
  },
  plugins: [],
}
