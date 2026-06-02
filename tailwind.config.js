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
        // Gold accent — used sparingly. Full ramp: shades 100/200/500/600/800
        // were referenced across the app (NotificationBell, announcement badges,
        // academics, finance, teacher assignments…) but were undefined, so those
        // classes rendered with no colour. Interpolated to the existing gold ramp.
        accent: {
          50:  '#FEF9E7',
          100: '#FCEFC4',
          200: '#F6DE93',
          300: '#E8C84A',
          400: '#D4A017',
          500: '#B8860B',
          600: '#A6750A',
          700: '#92600A',
          800: '#6E4807',
          900: '#4A2F04',
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
