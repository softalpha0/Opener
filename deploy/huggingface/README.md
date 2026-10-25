---
title: Opener
emoji: 🎤
colorFrom: red
colorTo: yellow
sdk: docker
app_port: 7860
pinned: false
license: mit
short_description: Tour where your fans actually are, with Qloo
---

# Opener on Hugging Face Spaces

This Space builds [Opener](https://github.com/softalpha0/Opener) from its public GitHub
repository (see `Dockerfile`) and runs it as one long-running container.

Set these under **Settings → Variables and secrets → New secret**:

- `QLOO_API_KEY` (required)
- `GEMINI_API_KEY` (optional; turns on the agent)

To pick up new commits from GitHub, use **Settings → Factory rebuild**.
