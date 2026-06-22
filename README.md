# [Missive JS](https://missive-js.github.io/missive.js)

## [![CI](https://github.com/missive-js/missive.js/actions/workflows/main-ci.yaml/badge.svg?branch=main)](https://github.com/Missive-js/missive.js/actions/workflows/main-ci.yaml) [![Deploy Docs](https://github.com/missive-js/missive.js/actions/workflows/deploy-to-pages.yaml/badge.svg?branch=main)](https://github.com/Missive-js/missive.js/actions/workflows/deploy-to-pages.yaml) [![Install size](https://packagephobia.com/badge?p=missive.js)](https://packagephobia.com/result?p=missive.js) ![Tree shaking](https://badgen.net/bundlephobia/tree-shaking/missive.js) ![Minizipped size](https://badgen.net/bundlephobia/minzip/missive.js)

The Service Bus that you needed!

> Fully-typed Service Bus for Node.js built in Typescript

## Documentation

- [Getting Started](https://missive-js.github.io/missive.js/guides/getting-started/)
- [Why you should use Missive.js](https://missive-js.github.io/missive.js/why/)

- [Simple CLI example](https://github.com/Missive-js/missive.js/blob/main/examples/cli/src/index.ts)

Please head over to the [documentation site](https://missive-js.github.io/missive.js/) for more information!

## Install

```bash
pnpm add missive.js
```

## Use it with your AI coding agent

Missive.js ships an Agent Skill that teaches your AI assistant to build with the library
correctly — typed contracts, handlers, the middleware catalog, and custom adapters. Its design
(contracts as the spec, typed dependency-injection seams) is a particularly good fit for
AI-assisted coding.

Install the skill into your project with the [skills CLI](https://skills.sh):

```bash
npx skills add missive-js/missive.js
```

Your agent picks it up automatically on its next session (it installs into `.claude/skills/`). See
[AI-Assisted Coding](https://missive-js.github.io/missive.js/ai-assisted-coding/) for the full story.

## Contributing

See [CONTRIBUTING.md in the repo](.github/CONTRIBUTING.md).

## MIT LICENSE

See [LICENSE in the repo](libs/missive.js/LICENSE).
