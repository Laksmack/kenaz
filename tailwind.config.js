/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/renderer/**/*.{html,tsx,ts}'],
  theme: {
    extend: {
      colors: {
        bg: {
          primary: '#0a0a0a',
          secondary: '#111111',
          tertiary: '#1a1a1a',
          hover: '#1a1a1a',
        },
        accent: {
          deep: '#C43E0C',
          primary: '#E8571F',
          warm: '#F7A94B',
          light: '#FFF8F0',
          pending: '#F2C94C',
          todo: '#F28C38',
          success: '#4CAF50',
          danger: '#ef4444',
        },
        text: {
          primary: '#f0e6da',
          secondary: '#999999',
          muted: '#555555',
        },
        border: {
          subtle: '#1a1a1a',
          active: '#E8571F',
        },
      },
      fontFamily: {
        sans: ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
  plugins: [],
};
