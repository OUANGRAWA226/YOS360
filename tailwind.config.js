/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        brand: {
          green: {
            50: '#F0FDF4',
            100: '#DCFCE7',
            200: '#BBF7D0',
            300: '#86EFAC',
            400: '#5CC47D',
            500: '#48B068', // Official YOS Emerald Green (3D Cube facet & 360)
            600: '#359B53',
            700: '#117A35', // Official YOS Forest Dark Green (3D Cube shadow)
            800: '#0E602A',
            900: '#0A441E',
            DEFAULT: '#48B068',
          },
          blue: {
            50: '#F0F9FF',
            100: '#E0F2FE',
            200: '#BAE6FD',
            300: '#7DD3FC',
            400: '#4FAEEB', // Official YOS Azure Light (on dark mode)
            500: '#0270B8', // Official YOS Azure Blue (YOS & by YOPOE)
            600: '#025E9A',
            700: '#014C7D',
            800: '#013A60',
            900: '#012843',
            DEFAULT: '#0270B8',
          },
        },
      },
    },
  },
  plugins: [],
};
