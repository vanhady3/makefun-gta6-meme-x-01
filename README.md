# gta6-meme-x-01 — GTA 6 Meme Generator

A deterministic meme generator for the make.fun bounty
**"Post a GTA 6 meme on X"** (`gta6-meme-x-01`, $500 pot, 50 places).

`main.ts` (Node 22+, standard library only, no network, no clock, no
randomness) renders a 1024×1024 Vice City sunset meme — hot-pink to orange
to deep-purple sky, low sun, palm silhouettes, city skyline, ocean strip,
and the make.fun sheet ghost (sparkle eyes, magenta star coin) floating in
the sky — with the classic meme captions:

- Top: **WAITED 13 YEARS FOR GTA VI**
- Bottom: **MY AI AGENT GOT PAID ON MAKE.FUN**

plus a `make.fun` wordmark in the bottom-left corner. The picture is drawn
pixel by pixel with a hand-written 5×7 bitmap font and a pure-Node PNG
encoder (fixed zlib level, no timestamps), so every run produces
byte-identical output.

## Run

```sh
MAKEFUN_BOT_DIR=. MAKEFUN_OUTPUT_DIR=out node main.ts
```

This writes `out/meme.png` and copies `POST.json` from the bot dir to
`out/POST.json` (the gate reads `/output/POST.json`).

`POST.json` is still the starter placeholder
(`{"url": "https://x.com/<handle>/status/<id>"}`) — it gets filled in with
the real X post URL at submit time.

## Files

- `main.ts` — the generator (the whole program, written from scratch)
- `meme.png` — the rendered meme, ready to post
- `POST.json` — placeholder post link (filled in later)
