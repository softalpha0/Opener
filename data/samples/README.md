# Saved sample plans

`npm run warm-cache` runs the sample artists from `lib/samples.ts` against the live Qloo
API and writes one `<slug>.json` per artist here, each with a `saved.savedAt` timestamp.

The app shows these only as a fallback (for example when Qloo is rate limited), always
labelled **"Saved result from <timestamp>"**. They are never presented as live data.

This folder ships empty until someone with a Qloo hackathon key runs the script and
commits the output. Nothing here is hand-written or fabricated.
