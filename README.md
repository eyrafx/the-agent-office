# The Agent Office

A dynamic island for **Windows** and a little office for your AI coding agents.

## Download

<!-- While the site says "coming soon", so does this link. When the installer is out,
     change the text to "⬇ Download The Agent Office vX.Y.Z" and point it at the release file. -->
**[⬇ Download The Agent Office (coming soon)](https://eyrafx.github.io/the-agent-office/#download)**

[![Latest version](https://img.shields.io/github/v/release/eyrafx/the-agent-office?include_prereleases&sort=semver&label=latest%20version)](https://github.com/eyrafx/the-agent-office/releases) · [What's new](CHANGELOG.md)

<!-- When the demo video is published, turn "▶ Watch Demo (coming soon)" into a link to it. -->
▶ Watch Demo *(coming soon)* · [Website and live demo](https://eyrafx.github.io/the-agent-office/) · [Türkçe README](README_TR.md)

> **Independent project.** The Agent Office is not affiliated with or endorsed by Microsoft, Anthropic, OpenAI or Anysphere (Cursor). Product names belong to their owners.

---

## What is The Agent Office?

The Agent Office sits at the top of your screen and shows what your coding agents are doing: who is working, who is waiting for you, and how much of your usage limit is left. Open the office and every chat becomes a colleague at a desk, grouped by project. Everything runs on your PC, with no account and no server of ours.

The island is called **Octolantis**, and **Octo**, a little octopus, lives in it and keeps you company.

## Features

- Agents at a glance: working, waiting for you and idle sessions, newest first
- Questions and permission requests come to the top
- The office: each project is an office, each chat an agent at a desk, the manager at the head of the room
- Claude and Codex usage limits (5-hour and weekly), with reset times
- Click a session to open it in Claude or Codex
- Never answers a question or approves a permission for you
- Media controls with optional synced lyrics
- Notes and to-dos, focus timer and countdown
- Alarms, reminders and a water reminder
- A file shelf: gather files, then drag them into any app
- Weather and battery in the small island
- Glass or dark look, and a different resting look per place (desktop, apps, browser)
- Stays out of the way of full-screen apps, follows your monitor and DPI
- Optional start with Windows, quietly in the tray
- 11 languages

## Supported tools

| Tool | How The Agent Office follows it |
|---|---|
| Claude Code (terminal, IDE, Claude desktop app) | A small hook relay added to Claude Code's settings (removable from Settings) |
| Codex (CLI and desktop app) | Reads Codex's own session files and project list, read-only |
| Cursor | A hook relay added to Cursor's hook settings (removable) |

Other tools are added only once their behaviour can be verified.

## Controls

| Control | Action |
|---|---|
| Hover the island (or touch the top edge) | Open the island |
| Move the pointer away | Close the island |
| `Ctrl+Alt+Space` | Open the island (changeable in Settings) |
| `Ctrl+Alt+M` | Mute (changeable in Settings) |
| Horizontal drag, wheel or touchpad swipe | Turn the island's pages |
| Click a session or a waiting question | Open that chat in Claude or Codex |
| Drag the handle in the island's header | Move the island along the top edge |
| Double-click the handle | Centre the island |
| Shelf: drag a file / click it | Drop it into an app / open it |
| Office: click the manager's desk | Choose the office's manager |
| Point at Octo | Octo looks at you |
| Tray icon | Open the office, Settings, Mute, Quit |

## Screenshots

<!-- Images go in assets/screenshots/ (sample data only). Uncomment each one when its file is added. -->

### The island

<!-- ![The island at the top of the screen](assets/screenshots/1-island.png) -->

### The office

<!-- ![The office with agents at their desks](assets/screenshots/2-office.png) -->

### Usage limits

<!-- ![Claude and Codex usage limits](assets/screenshots/3-limits.png) -->

### The island's pages

<!-- ![Media, notes and focus pages](assets/screenshots/4-pages.png) -->

## Installation

1. Download **AgentOffice_x.y.z_x64-setup.exe** with the download link above *(coming soon)*.
2. Run the installer. A per-user install needs no administrator access.
3. The Agent Office starts. The first-run screen finds Claude Code, Codex and Cursor and connects them in one step.
4. Hover the top edge of your screen to open the island; open the office from the island or the tray icon.

A Microsoft Store version is planned.

## Languages

- English
- Turkish
- German
- Spanish
- French
- Italian
- Portuguese (Brazil)
- Russian
- Japanese
- Korean
- Simplified Chinese

## Requirements

- Windows 10 or 11 (64-bit)
- Microsoft Edge WebView2 Runtime (already present on most PCs)
- Claude Code, Codex or Cursor for the agent features (the island's other pages work without them)

## Uninstall

Remove The Agent Office from Windows' **Installed apps**. The uninstaller also removes The Agent Office's hooks from Claude Code and Cursor; your agents and their settings are otherwise untouched.

With the Store version, turn the connection off in Settings › Advanced before uninstalling.

## Privacy

- No account, no analytics, no server of ours.
- Chat contents are not uploaded anywhere; The Agent Office reads only session events, titles and project names.
- Claude limits use your existing local Claude Code sign-in to ask Anthropic's usage service; the token is never stored, logged or sent elsewhere.
- Synced lyrics (LRCLIB) and weather (Open-Meteo) stay off until you turn them on.

Full policy: [Privacy](https://eyrafx.github.io/the-agent-office/privacy.html)

## Build from source

Requirements: Windows 10/11, Node.js 20+, Visual Studio C++ Build Tools. Rust can be installed inside the project folder with `scripts/install-local-rust.ps1`.

```powershell
npm --prefix app ci
npm --prefix app run build                        # frontend, needed before the Rust build
powershell -File scripts/dev.ps1 -Action test     # frontend tests, hook relay, Rust tests
powershell -File scripts/dev.ps1 -Action native   # run the app
powershell -File scripts/dev.ps1 -Action bundle   # build the installer
```

`scripts/dev.ps1` keeps Rust, caches, build output and test data inside the project folder (`.tools/`, `.artifacts/`, `.local-data/`), so a development build never touches an installed copy.

### Making a release

1. `node scripts/set-version.mjs X.Y.Z` sets the version everywhere (with no argument it checks that all places agree).
2. Add a `## X.Y.Z` section to [CHANGELOG.md](CHANGELOG.md) and [CHANGELOG_TR.md](CHANGELOG_TR.md), then commit and push.
3. **Actions › Draft release › Run workflow** with X.Y.Z builds the installer and creates a **draft** release with the changelog text and the installer's SHA-256. Nothing is public until the draft is published on the Releases page.

| Folder | What it is |
|---|---|
| `app/` | The desktop app: TypeScript UI, Rust/Tauri 2 shell, hook relay, tests |
| `site/` | The website; `site/dist/` is what GitHub Pages publishes ([site/README.md](site/README.md)) |
| `promo-site/`, `promo-video/` | The browser demo and scripts used to film the promo videos |
| `design/` | Scripts that prepare the mascot and office artwork |
| `scripts/` | Development helpers |
| `licenses/` | License texts shipped with the installer |

## Contributing

Issues, bug reports and pull requests are welcome: [Issues](https://github.com/eyrafx/the-agent-office/issues).

## Support

The Agent Office is free. If it helps you, you can support it on the [support page](https://eyrafx.github.io/the-agent-office/#support).

## Thanks

The Agent Office was built with Claude, made possible by Anthropic's startup support program. Thank you, Anthropic 💕

## License

- **Code**: [MIT License](LICENSE), © 2026 eyra.
- **Names, mascot and artwork**: the names "The Agent Office", "AgentOffice", "Octolantis" and "Octo", the Octo mascot, the office illustrations, the icon and all other images, animations and videos are **not** covered by MIT; all rights reserved. See [LICENSE-ASSETS.md](LICENSE-ASSETS.md). Forks are welcome under their own name and artwork.
- **Third-party parts**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

Created by **eyra**

GitHub: **[@eyrafx](https://github.com/eyrafx)**  
Questions and suggestions: **[GitHub Discussions](https://github.com/eyrafx/the-agent-office/discussions)**  
Bug reports: **[GitHub Issues](https://github.com/eyrafx/the-agent-office/issues)**
