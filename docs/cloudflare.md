# Cloudflare deployment

The same App Router source runs locally through Next.js and on Cloudflare Workers through vinext. The Cloudflare path preserves `proxy.ts`, server-rendered localization, route handlers and the interactive client renderer.

## Commands

```sh
npm ci
npm run build:vinext
npm run start:vinext
npm run deploy:vinext
```

`start:vinext` uses the built Worker with Wrangler. `dev:vinext` starts the Vite development environment on port 3001. The original `dev`, `build` and `start` commands continue to use Next.js/Turbopack.

Authenticate with `npx wrangler login` before the first deployment. The Worker name and bindings are defined in `wrangler.jsonc`; deployment uses the generated `dist/server/wrangler.json`. Wrangler may provision the declared KV namespace on the first deployment. Never commit OAuth credentials, API tokens or local Wrangler state.

## Runtime configuration

- `ASSETS` serves the compiled client, fonts, posters, share artwork and sized texture maps.
- `VINEXT_KV_CACHE` persists the data cache used for upstream weather requests.
- `nodejs_compat` supplies the Node APIs required by the runtime.
- `ORBITAL_SITE_URL` optionally sets the canonical public origin. When absent, metadata uses the incoming host. Copy `.env.example` for local configuration; set a Worker variable for a custom domain.

Static asset routes bypass the application Worker. `public/.assetsignore` excludes archival texture originals, while retaining runtime tiers, lightweight previews and attribution. Workers accepts at most 25 MiB per static asset; texture tests enforce that limit. `npm run prepare:textures` and `npm run prepare:og` regenerate committed runtime assets before the application build.

The browser automatically upgrades to the highest genuine source resolution its GPU supports. 8K remains part of the experience. Network and device signals affect the starting tier and upgrade timing, and a lost context lowers the session ceiling. No quality selector is exposed.

## Weather and images

The precipitation mask uses portable JavaScript PNG processing. It does not require native `sharp` binaries on Workers; `sharp` remains a development dependency for asset preparation. External services can return recoverable 502 responses, and local maps remain usable.

The optional Python NOAA ingester writes a local ignored file. A Worker cannot run that local background process; its NOAA route returns the documented empty/stale fallback until an external ingestion/storage integration is supplied. EUMETSAT and NASA requests remain independent.

Cloudflare Images is not required or provisioned. Local posters are already WebP; the runtime serves them through the supported image fallback path.

## Validation and publication

Run `npm test`, `npm run lint`, `npm run build`, `npm run typecheck` and `npm run build:vinext`. Run the browser suite against production Next.js, then validate the built Worker with:

```sh
PLAYWRIGHT_EXTERNAL_SERVER=1 PLAYWRIGHT_BASE_URL=http://localhost:8787 npm run test:e2e
```

Use equivalent environment-variable syntax on PowerShell. Test the published URL after deployment: HTTP 200, both languages, localized canonical/share metadata, posters/fonts, genuine 8K assets, dialog navigation, retry behavior, `/robots.txt` and `/sitemap.xml`. Never substitute a guessed domain for the deployment-returned public URL.
