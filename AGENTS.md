<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Aturan Git & Deploy (wajib setiap ada perubahan)

1. Setelah perubahan selesai dan terverifikasi (build/tampilan), commit dengan pesan konvensional (`feat:`, `fix:`, `style:`, dst.).
2. Push ke GitHub repo ini (`origin`, branch `main`): `git push origin main`.
3. Deploy ke Cloudflare Workers berjalan otomatis lewat `.github/workflows/deploy.yml` saat push ke `main`. Butuh secret `CLOUDFLARE_API_TOKEN`; tanpa itu langkah deploy dilewati. Pantau hasil dengan `gh run watch`.
4. Jika deploy otomatis tidak jalan, deploy manual: `npm run deploy` (butuh `wrangler login` atau `CLOUDFLARE_API_TOKEN`).
5. Jangan commit `.env.local` atau secret apa pun.
