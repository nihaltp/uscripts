# Providers

Provider-specific logic for each AI platform lives here.

- [`provider-base.js`](provider-base.js) contains shared provider logic via a `createProvider` factory function.
- [`chatgpt.js`](chatgpt.js) contains ChatGPT-specific URL parsing and provider configuration.
- [`gemini.js`](gemini.js) contains Gemini-specific URL parsing and provider configuration.
