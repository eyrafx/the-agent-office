<p align="center"><b>English</b> | <a href="README.tr.md">Türkçe</a></p>

# AgentOffice

**A dynamic island for Windows and a little office for your AI agents.**

<!-- Download button: while the site says "coming soon", the label says so too.
     Once the installer is published, change "Download%20(coming%20soon)" to "Download%20for%20Windows". -->
<p align="center">
  <a href="https://eyrafx.github.io/agentoffice/#download"><img src="https://img.shields.io/badge/Download%20(coming%20soon)-Windows%2010%20%7C%2011-0078D4?style=for-the-badge" alt="Download for Windows (coming soon)"></a>
  <a href="https://eyrafx.github.io/agentoffice/"><img src="https://img.shields.io/badge/Website-live%20demo-F27B35?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Website and live demo"></a>
  <a href="https://eyrafx.github.io/agentoffice/#support"><img src="https://img.shields.io/badge/Support-the%20project-E5498F?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Support the project"></a>
</p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/code-MIT-informational" alt="Code: MIT"></a>
  <a href="LICENSE-ASSETS.md"><img src="https://img.shields.io/badge/names%20%26%20artwork-all%20rights%20reserved-lightgrey" alt="Names and artwork: all rights reserved"></a>
</p>

AgentOffice's island, Octolantis, sits at the top of your screen with Octo, the octopus mascot, and shows what your coding agents are doing: who is working, who is waiting for you, and how much of your usage limit is left. Open the office to see every chat as a colleague at a desk, grouped by project.

<!-- HERO VIDEO / GIF (to add): the island and the office in motion, sample data only.
<p align="center">
  <img src="docs/media/hero.gif" alt="AgentOffice: the island opening and the office at work" width="720">
</p>
-->

<!-- SCREENSHOTS (to add, 3–4, sample data only):
<p align="center">
  <img src="docs/media/island.png" alt="The island at the top of the screen" width="360">
  <img src="docs/media/office.png" alt="The office with agents at their desks" width="360">
  <img src="docs/media/limits.png" alt="Claude and Codex usage limits" width="360">
  <img src="docs/media/pages.png" alt="The island's media, notes and focus pages" width="360">
</p>
-->

## Features

- **Agents at a glance**: running, waiting for you and idle sessions, newest first; questions and permission requests come to the top.
- **The office**: each project is an office, each chat an agent at a desk; the manager sits at the head of the room.
- **Usage limits**: Claude and Codex 5-hour and weekly limits, with reset times.
- **Open in place**: click a session to jump to it in Claude or Codex. AgentOffice never answers a question or approves a permission for you.
- **The island's other pages**: media controls with synced lyrics (optional), notes and to-dos, focus timer and countdown, alarms, water reminder.
- **Made for Windows**: stays out of full-screen apps, follows your monitor and DPI, optional start with Windows.
- **11 languages**: English, Türkçe, Deutsch, Español, Français, Italiano, Português (Brasil), Русский, 日本語, 한국어, 简体中文.

## Supported tools

| Tool | How AgentOffice follows it |
|---|---|
| Claude Code (terminal, IDE, Claude desktop app) | A small hook relay added to Claude Code's settings (removable from Settings) |
| Codex (CLI and desktop app) | Reads Codex's own session files and project list, read-only |
| Cursor | A hook relay added to Cursor's hook settings (removable) |

Other tools are added only once their behaviour can be verified. No universal "every AI app" support is claimed.

## Install

- **Microsoft Store**: *(link once published)*
- **Installer** *(coming soon)*: `AgentOffice_x.y.z_x64-setup.exe` will be published on [Releases](https://github.com/eyrafx/agentoffice/releases) with its SHA-256. Per-user install, no admin rights needed.
- Requires Windows 10 or 11 with the Microsoft Edge WebView2 Runtime (already present on most PCs).

### Build from source

Requirements: Windows 10/11, Node.js 20+, Visual Studio C++ Build Tools. Rust can be installed inside the project folder with `scripts/install-local-rust.ps1`.

```powershell
npm --prefix app ci
npm --prefix app run build                        # frontend, needed before the Rust build
powershell -File scripts/dev.ps1 -Action test     # frontend tests, hook relay, Rust tests
powershell -File scripts/dev.ps1 -Action native   # run the app
powershell -File scripts/dev.ps1 -Action bundle   # build the installer
```

`scripts/dev.ps1` keeps Rust, caches, build output and the app's test data inside the project folder (`.tools/`, `.artifacts/`, `.local-data/`), so a development build never touches an installed AgentOffice.

## Repository layout

| Folder | What it is |
|---|---|
| `app/` | The desktop app: TypeScript UI (`app/src`), Rust/Tauri 2 shell (`app/src-tauri`), the hook relay (`app/hook`), tests (`app/tests`, `app/src-tauri/tests`) |
| `site/` | The website at [eyrafx.github.io/agentoffice](https://eyrafx.github.io/agentoffice/). `site/dist/` is the published static site; see [site/README.md](site/README.md) |
| `promo-site/` | A small browser demo of the island and office, used to film the promo videos |
| `promo-video/` | Scripts that capture and render the promo videos (the videos themselves are not in the repository) |
| `design/` | Scripts that prepare the mascot and office artwork |
| `scripts/` | Development helpers (`dev.ps1`, local Rust install) |
| `licenses/` | License texts shipped with the installer |

## Privacy

- Everything runs on your PC. There is no account, no analytics and no AgentOffice server.
- Chat contents are not uploaded anywhere. AgentOffice reads only what it needs to show status: session events, titles and project names.
- To show Claude limits it uses your existing local Claude Code sign-in to ask Anthropic's usage service; the token is never stored, logged or sent elsewhere.
- Synced lyrics (LRCLIB) and weather (Open-Meteo) are off until you turn them on. Site icons are fetched from the open site itself, never from a third-party icon service.
- The installer's uninstaller removes AgentOffice's hooks from Claude Code and Cursor. With the Store version, turn the connection off in Settings › Advanced before uninstalling.

Full policy: [Privacy](https://eyrafx.github.io/agentoffice/privacy.html)

## License

- **Code**: [MIT](LICENSE), © 2026 eyra.
- **Names, mascot and artwork**: the names "AgentOffice", "Octolantis" and "Octo", the Octo mascot, the office illustrations, the icon and all other images, animations and videos are **not** under MIT; all rights reserved. See [LICENSE-ASSETS.md](LICENSE-ASSETS.md). Forks are welcome under their own name and artwork.
- **Third-party parts**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) (includes MIT code adapted from [Coucou](https://github.com/Louis-CFM/coucou)).

AgentOffice is an independent project and is not affiliated with or endorsed by Anthropic, OpenAI, Anysphere (Cursor) or Microsoft. Product names belong to their owners.

## Support

AgentOffice is free. If it helps you, you can support development with a crypto donation on the [support page](https://eyrafx.github.io/agentoffice/#support). Bug reports and ideas: [Issues](https://github.com/eyrafx/agentoffice/issues).
