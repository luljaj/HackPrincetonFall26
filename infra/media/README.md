# Trial episode storage

The playback lab uses episode 3 (`When I Grow Up`) from Cloudflare R2, configured in `apps/web/app/lab/episode.json`. The same remote source feeds the episode player and the speaking/listening loops, preserving their timestamps.

- Bucket: `dora-lab-assets`
- Object: `episodes/dora-ep3-a9a73190.mp4`
- Public trial URL: `https://pub-343d136a9e084b44b523c15d437bbb0e.r2.dev/episodes/dora-ep3-a9a73190.mp4`
- Account ID: `f5a01b2a1b774ef900536723435cd5d0`
- Size: 140,642,543 bytes; duration: 1,445.677567 seconds.

The bucket allows public read-only access. `cors.json` permits GET/HEAD and Range requests so browsers can seek and route episode audio through Web Audio. All three video elements set `crossOrigin="anonymous"`. CORS is necessary for Web Audio; it is not an access-control mechanism.

Re-upload using Wrangler after signing into the account:

```sh
export CLOUDFLARE_ACCOUNT_ID=f5a01b2a1b774ef900536723435cd5d0
npx wrangler r2 bucket cors set dora-lab-assets --file infra/media/cors.json
npx wrangler r2 object put dora-lab-assets/episodes/dora-ep3-a9a73190.mp4 \
  --remote --file apps/web/public/media/dora-ep3.mp4 \
  --content-type video/mp4 --content-disposition inline \
  --cache-control 'public, max-age=31536000, immutable'
```

Use a new content-hashed object name and update `episode.json` when changing the video. The MP4 has its metadata at the beginning for fast startup. HTTP 206 seeking and a byte-for-byte range match against the local source were verified after upload.

The `r2.dev` URL is intended for the trial; configure an R2 custom domain before production. No Cloudflare credentials or full episode video are committed to Git.
