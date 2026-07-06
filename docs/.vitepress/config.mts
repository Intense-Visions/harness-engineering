import { defineConfig } from 'vitepress';

export default defineConfig({
  title: 'Harness Engineering',
  description: 'AI Harness Engineering & Agent-First Development',
  ignoreDeadLinks: true,
  // roadmap.md + roadmap.d/** + roadmap-archive.md are machine-managed roadmap data
  // (not doc pages, not in the nav); the deterministic serializer emits raw text like
  // "<slug>" that the Vue/markdown compiler would choke on. Exclude them like
  // plans/changes/research.
  srcExclude: ['plans/**', 'changes/**', 'research/**', 'roadmap.md', 'roadmap.d/**', 'roadmap-archive.md'],
  themeConfig: {
    nav: [
      { text: 'Home', link: '/' },
      { text: 'Standard', link: '/standard/' },
      { text: 'Guides', link: '/guides/' },
      { text: 'Reference', link: '/reference/' },
      { text: 'API', link: '/api/' }
    ],
    sidebar: {
      '/standard/': [
        {
          text: 'The Standard',
          items: [
            { text: 'Overview', link: '/standard/' },
            { text: 'Principles', link: '/standard/principles' },
            { text: 'Implementation', link: '/standard/implementation' }
          ]
        }
      ],
      '/guides/': [
        {
          text: 'Guides',
          items: [
            { text: 'Overview', link: '/guides/' },
            { text: 'Getting Started', link: '/guides/getting-started' },
            { text: 'Best Practices', link: '/guides/best-practices' }
          ]
        }
      ],
      '/reference/': [
        {
          text: 'Reference',
          items: [
            { text: 'Overview', link: '/reference/' },
            { text: 'CLI', link: '/reference/cli' },
            { text: 'Configuration', link: '/reference/configuration' }
          ]
        }
      ],
      '/api/': [
        {
          text: 'API Documentation',
          items: [
            { text: 'Overview', link: '/api/' }
          ]
        }
      ]
    },
    socialLinks: [
      { icon: 'github', link: 'https://github.com/harness-engineering/harness-engineering' }
    ]
  }
});
