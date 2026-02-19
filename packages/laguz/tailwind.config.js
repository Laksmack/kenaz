import preset from '@futhark/core/tailwind.preset';

/** @type {import('tailwindcss').Config} */
export default {
  presets: [preset],
  content: [
    './src/renderer/**/*.{html,tsx,ts}',
    '../../packages/core/**/*.{tsx,ts}',
  ],
};
