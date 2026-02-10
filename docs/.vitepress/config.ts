import { defineConfig } from 'vitepress'
import react from '@vitejs/plugin-react'

export default defineConfig({
  title: 'cooklang-parse',
  description: 'A simple, type-safe Cooklang parser for TypeScript',
  lang: 'en-US',
  base: '/cooklang-parse/',

  head: [
    ['meta', { name: 'theme-color', content: '#e8590c' }],
    ['meta', { name: 'og:type', content: 'website' }],
    ['meta', { name: 'og:title', content: 'cooklang-parse' }],
    ['meta', { name: 'og:description', content: 'A simple, type-safe Cooklang parser for TypeScript' }],
  ],

  themeConfig: {
    nav: [
      { text: 'Guide', link: '/guide/getting-started' },
      { text: 'Cooklang Syntax', link: '/guide/cooklang-syntax' },
      { text: 'API Reference', link: '/reference/' },
      { text: 'Playground', link: '/playground' },
      {
        text: 'Links',
        items: [
          { text: 'Changelog', link: 'https://github.com/briansunter/cooklang-parse/releases' },
          { text: 'Cooklang Spec', link: 'https://cooklang.org/docs/spec/' },
          { text: 'npm', link: 'https://www.npmjs.com/package/cooklang-parse' },
        ],
      },
    ],

    sidebar: [
      {
        text: 'Guide',
        items: [
          { text: 'What is cooklang-parse?', link: '/guide/what-is-cooklang-parse' },
          { text: 'Getting Started', link: '/guide/getting-started' },
          { text: 'Playground', link: '/playground' },
        ],
      },
      {
        text: 'Cooklang',
        items: [
          { text: 'Cooklang Syntax', link: '/guide/cooklang-syntax' },
          { text: 'Syntax Features Table', link: '/guide/syntax-features' },
        ],
      },
      {
        text: 'Internals',
        items: [
          { text: 'How It Works (Ohm.js)', link: '/guide/how-it-works' },
        ],
      },
      {
        text: 'API Reference',
        items: [
          { text: 'Overview', link: '/reference/' },
          { text: 'parseCooklang', link: '/reference/parse-cooklang' },
          { text: 'Types', link: '/reference/types' },
        ],
      },
    ],

    socialLinks: [
      { icon: 'github', link: 'https://github.com/briansunter/cooklang-parse' },
    ],

    footer: {
      message: 'Released under the MIT License.',
      copyright: 'Copyright 2025-present Brian Sunter.',
    },

    editLink: {
      pattern: 'https://github.com/briansunter/cooklang-parse/edit/master/docs/:path',
      text: 'Edit this page on GitHub',
    },

    search: {
      provider: 'local',
    },

    outline: {
      level: [2, 3],
    },
  },

  markdown: {
    lineNumbers: true,
  },

  vite: {
    plugins: [react()],
    css: {
      postcss: {
        plugins: [
          (await import('tailwindcss')).default,
          (await import('autoprefixer')).default,
        ],
      },
    },
    ssr: {
      noExternal: ['lucide-react', 'cooklang-parse'],
    },
  },
})
