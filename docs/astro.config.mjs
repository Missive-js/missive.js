import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

import tailwind from '@astrojs/tailwind';

import react from '@astrojs/react';

const github = 'https://github.com/missive-js/missive.js';
const githubURL = new URL(github);
const githubPathParts = githubURL.pathname.split('/');
const title = 'Missive.js';
export default defineConfig({
    site: `https://${githubPathParts[1]}.github.io/${githubPathParts[2]}`,
    base: `${githubPathParts[2]}`,
    integrations: [
        starlight({
            title,
            logo: {
                src: './src/assets/envelope.svg',
                alt: title,
            },
            social: {
                github,
            },
            customCss: ['./src/tailwind.css'],
            components: {
                Footer: './src/ui/components/astro/footer.astro',
            },
            sidebar: [
                {
                    label: 'Why Missive.js?',
                    slug: 'why',
                    badge: {
                        text: 'must read',
                        variant: 'tip',
                    },
                },
                {
                    label: 'Guides',
                    autogenerate: { directory: 'guides' },
                },
                {
                    label: 'Contributing',
                    slug: 'contributing',
                    badge: {
                        text: 'we need you!',
                        variant: 'success',
                    },
                },
            ],
        }),
        tailwind({
            applyBaseStyles: false,
            nesting: true,
        }),
        react(),
    ],
});
