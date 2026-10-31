# Third-party notices

AgentOffice is an independent product with its own name, icon, character and visual assets. Its own source code is MIT-licensed ([LICENSE](LICENSE)); its name and artwork are reserved ([LICENSE-ASSETS.md](LICENSE-ASSETS.md)). This file lists the parts that come from others.

## Coucou source code (MIT)

Selected MIT source from Coucou, https://github.com/Louis-CFM/coucou, commit `1e5180921c1326fc72e41d313e3e2855e9c10162`, was used as a reference during development; it is not included in this repository.

Copyright (c) 2026 Louis Raillé. Licensed under the MIT License. The full notice is kept in [`licenses/Coucou-MIT.txt`](licenses/Coucou-MIT.txt), and installers ship it as `licenses/Coucou-MIT.txt`.

The AgentOffice native shell adapts the non-activating tool-window style from `windows/src-tauri/src/platform/windows.rs` and the physical-pixel/DPI geometry reassertion and monitor recovery approach from `windows/src-tauri/src/island.rs`. Upstream speech, phone, updater and integrations are not included.

The Coucou and Mochi names, the Mochi character, its animations, the icon, the sounds and the other reserved Coucou artwork are **not** used or packaged. They are not covered by Coucou's MIT License; their separate restrictions are in Coucou's own `LICENSE-ASSETS.md`, kept here for provenance as [`licenses/Coucou-assets-excluded.md`](licenses/Coucou-assets-excluded.md).

## Mascot artwork

The Octo mascot clips (`app/public/mascot/ada/`, also copied to `site/dist/mascot/ada/`) were made by the AgentOffice author, eyra, in October 2026 with a locally run open video model from the author's own robot-octopus artwork and cleaned with a local upscaler. The other mascot images were created by the author with ChatGPT's image generation (OpenAI) in October 2026, from the author's own prompts and earlier robot-octopus concept. They contain no third-party characters or stock artwork. They are not under the MIT License; see [LICENSE-ASSETS.md](LICENSE-ASSETS.md).

## AI provider marks

The small Claude and OpenAI marks drawn in `app/src/ui/icons.ts` are taken from [Simple Icons](https://github.com/simple-icons/simple-icons) (files under CC0 1.0). The marks themselves are trademarks of Anthropic PBC and OpenAI and are used only to show which tool a session belongs to. AgentOffice is not affiliated with or endorsed by Anthropic, OpenAI, Anysphere (Cursor) or Microsoft.

## Fonts

- The desktop app uses the system's Segoe UI font (owned by Microsoft); no font file is bundled.
- `promo-site/public/fonts/Manrope-var.woff2` (the browser demo used by `promo-video/`): Manrope, Copyright 2018 The Manrope Project Authors, SIL Open Font License 1.1 ([`promo-site/public/fonts/Manrope-OFL.txt`](promo-site/public/fonts/Manrope-OFL.txt)).
- `site/dist/fonts/quicksand/` (the website): Quicksand, Copyright 2011 The Quicksand Project Authors, SIL Open Font License 1.1 ([`site/dist/fonts/quicksand/OFL.txt`](site/dist/fonts/quicksand/OFL.txt)).
- `site/dist/fonts/kawaii/` (the website, subsets made with `site/kawaii-fonts.py`), all SIL Open Font License 1.1: Dela Gothic One, Copyright 2020 The Dela Gothic Project Authors ([`OFL-delagothicone.txt`](site/dist/fonts/kawaii/OFL-delagothicone.txt)); M PLUS Rounded 1c, Copyright 2016 The Rounded M+ Project Authors ([`OFL-mplusrounded1c.txt`](site/dist/fonts/kawaii/OFL-mplusrounded1c.txt)); Do Hyeon ([`OFL-dohyeon.txt`](site/dist/fonts/kawaii/OFL-dohyeon.txt)); Gowun Dodum ([`OFL-gowundodum.txt`](site/dist/fonts/kawaii/OFL-gowundodum.txt)); ZCOOL KuaiLe ([`OFL-zcoolkuaile.txt`](site/dist/fonts/kawaii/OFL-zcoolkuaile.txt)).

## Runtime dependencies (shipped in the app)

Frontend (exact versions in `app/package-lock.json`):

| Package | License |
|---|---|
| `three` | MIT |
| `@tauri-apps/api` | Apache-2.0 OR MIT |

Rust (458 registry crates, exact versions in `app/src-tauri/Cargo.lock`; licenses read from each crate's manifest on 29 Oct 2026). Direct dependencies: `tauri` and `tauri-plugin-single-instance` (MIT OR Apache-2.0), `serde`, `serde_json`, `tokio` (MIT / MIT OR Apache-2.0), `rusqlite` with bundled SQLite (MIT; SQLite itself is public domain), `windows`, `windows-sys`, `windows-future`, `webview2-com` (MIT OR Apache-2.0). The hook relay in `app/hook/` has no runtime dependencies; it links the Visual C++ runtime statically through the build-time crate `static_vcruntime` (MIT OR Apache-2.0 OR Zlib).

Transitive licenses found: MIT, Apache-2.0, MIT OR Apache-2.0, Unicode-3.0, Zlib, BSD-3-Clause, ISC, Unlicense OR MIT, 0BSD, CC0-1.0 OR MIT-0, Apache-2.0 WITH LLVM-exception, and **MPL-2.0** (`cssparser`, `cssparser-macros`, `dtoa-short`, `selectors`, `option-ext`; used unmodified, their source is available from crates.io). All are compatible with distributing AgentOffice under MIT. No GPL or other strong-copyleft crate is linked.

Binary releases must carry the license texts of these crates. Generate the full list before each release, for example with `cargo about generate` or `cargo license`, and ship it next to `licenses/Coucou-MIT.txt`.

Tauri uses the Microsoft Edge WebView2 Runtime installed on Windows. The installer does not install that runtime or modify other applications.

## Website (`site/`)

- `site/dist/vendor/qrcode.js`: QR Code Generator for JavaScript, Copyright (c) 2009 Kazuhiko Arase, MIT License (notice kept in the file). "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
- `site/dist/product/` is a build of the desktop app's own interface code (see `site/build-product.mjs`) and carries the same notices as the app above.
- Product names (Claude, Claude Code, Codex, Cursor, Windows and others) are used only to describe compatibility.

## Build and development tools (not shipped)

`vite`, `vitest` (MIT), `typescript`, `@playwright/cli` (Apache-2.0), `@tauri-apps/cli` (Apache-2.0 OR MIT), `lightningcss` (MPL-2.0, build only). The promotional video build in `promo-video/` uses `ffmpeg-static`, which downloads an FFmpeg binary under **GPL-3.0-or-later**; it is a local build tool only, is never linked into or distributed with AgentOffice, and does not affect the license of the rendered videos.

## Online services

When the user turns them on, AgentOffice talks to: LRCLIB (`lrclib.net`) for synced lyrics, the open site's own favicon (fetched from that site, never from a third-party icon service), Open-Meteo (`api.open-meteo.com`, `geocoding-api.open-meteo.com`) for the weather, and Anthropic's usage endpoint with the user's own local Claude Code sign-in. Weather data by [Open-Meteo.com](https://open-meteo.com/) (CC BY 4.0; its free API is for non-commercial use). Lyrics and other content fetched at run time belong to their owners and are not part of this repository.
