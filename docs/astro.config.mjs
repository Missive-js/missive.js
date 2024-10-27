import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';
import tailwind from '@astrojs/tailwind';
import starlightLinksValidator from 'starlight-links-validator';
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
            plugins: [starlightLinksValidator()],
            head: [
                {
                    tag: 'script',
                    attrs: {
                        src: 'https://plausible.io/js/script.js',
                        'data-domain': 'missive-js.github.io/missive.js',
                        defer: true,
                        'is:inline': true,
                    },
                },
            ],
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
                SocialIcons: './src/ui/components/astro/social-icons.astro',
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
                    label: 'Built-in Middlewares',
                    autogenerate: { directory: 'built-in-middlewares' },
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
