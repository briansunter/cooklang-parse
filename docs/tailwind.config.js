/** @type {import('tailwindcss').Config} */
export default {
  content: [
    './.vitepress/**/*.{js,ts,vue,tsx}',
    './*.md',
    './guide/**/*.md',
    './reference/**/*.md',
  ],
  theme: {
    extend: {
      colors: {
        // VitePress orange accent
        vp: {
          orange: '#e8590c',
          'orange-light': '#ff6b2c',
          'orange-dark': '#d14a0a',
        },
      },
    },
  },
  plugins: [],
}
