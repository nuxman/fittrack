import colors from 'tailwindcss/colors';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: colors.amber,
        surface: { DEFAULT: '#171717', raised: '#262626', base: '#0a0a0a' },
      },
    },
  },
  plugins: [],
};
