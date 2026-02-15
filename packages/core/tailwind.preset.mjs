/** @type {import('tailwindcss').Config} */
export default {
  theme: {
    extend: {
      colors: {
        bg: {
          primary: 'rgb(var(--bg-primary) / <alpha-value>)',
          secondary: 'rgb(var(--bg-secondary) / <alpha-value>)',
          tertiary: 'rgb(var(--bg-tertiary) / <alpha-value>)',
          hover: 'rgb(var(--bg-hover) / <alpha-value>)',
        },
        accent: {
          deep: 'rgb(var(--accent-deep) / <alpha-value>)',
          primary: 'rgb(var(--accent-primary) / <alpha-value>)',
          warm: 'rgb(var(--accent-warm) / <alpha-value>)',
          light: 'rgb(var(--accent-light) / <alpha-value>)',
          pending: 'rgb(var(--accent-pending) / <alpha-value>)',
          todo: 'rgb(var(--accent-todo) / <alpha-value>)',
          success: 'rgb(var(--accent-success) / <alpha-value>)',
          danger: 'rgb(var(--accent-danger) / <alpha-value>)',
          warning: 'rgb(var(--accent-warning) / <alpha-value>)',
        },
        text: {
          primary: 'rgb(var(--text-primary) / <alpha-value>)',
          secondary: 'rgb(var(--text-secondary) / <alpha-value>)',
          muted: 'rgb(var(--text-muted) / <alpha-value>)',
        },
        border: {
          subtle: 'rgb(var(--border-subtle) / <alpha-value>)',
          active: 'rgb(var(--border-active) / <alpha-value>)',
        },
      },
      fontFamily: {
        sans: ['Outfit', '-apple-system', 'BlinkMacSystemFont', 'Helvetica Neue', 'sans-serif'],
        mono: ['SF Mono', 'Fira Code', 'Cascadia Code', 'monospace'],
      },
    },
  },
};
