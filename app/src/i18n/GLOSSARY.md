# Translation glossary

One catalog per locale in `locales/`, keyed like `en.json` (the source). Turkish (`tr.json`) is the
product's first language: read it beside English to get the meaning. Every catalog has every key
(the test `tests/i18n.test.ts` fails otherwise).

## Message format

- `{name}` puts in a value. Keep every value of the English message; use none it does not have.
  `alarms.rings_at` / `alarms.reminds_at` may use `{day}` (sentence start) or `{dayLower}`.
- `{n, plural, one {# file} other {# files}}`: the language's own CLDR categories (`zero`, `one`,
  `two`, `few`, `many`, `other`; `other` always). `#` is the number. Languages without plural
  inflection (ja, ko, zh, tr) write plain `{n}`.
- `{source, select, claude {…} other {…}}`: keep the option names, translate the texts.
- Apostrophes are plain text. A literal brace is written `'{'`.
- `app.*` and `tray.*`: words the native side writes (agent activity, errors, the tray menu).
  `tr.json` holds exactly what that side writes and must not change; other languages translate freely.
- `ofis.*`: the office drawing (`design/ofis_aktar.py`); `{sure}` and `{saat}` are filled there.

## Voice

Short, plain UI words; a button or a tab is as short as the English or shorter (the island is narrow,
German and Russian run long: prefer the common short form). Address the user as Turkish does (`sen`):
es `tú`, pt-BR `você`, it `tu`, de `du`, fr `vous`, ru `вы`, ja/ko polite neutral (です・ます / 해요체),
zh 你. Sentence case, not Title Case, except where the language capitalises nouns (de).

## Terms

| Concept | en | tr |
| --- | --- | --- |
| The notch window at the top of the screen | island (small island / open island) | ada (küçük ada / açık ada) |
| An AI chat working for the user | agent; chat | ajan; sohbet |
| A chat's helper sub-agent | helper | yardımcı |
| A project's room | office | ofis |
| The chat the user picks to lead an office | manager | yönetici |
| States | Working · Waiting for you · Idle · Past · Closed | Çalışıyor · Seni bekliyor · Boşta · Geçmiş · Kapandı |
| A state nobody can tell | Current state unknown | Güncel durumu bilinmiyor |
| An agent asks to run a tool | permission (asks permission) | izin (izin istiyor) |
| An agent asks the user something | question | soru |
| Usage windows of the AI plans | limits | limitler |
| Pages of the island | Agents · Media · Notes · Focus · Alarms · Water · Shelf | Ajanlar · Medya · Notlar · Odak · Alarmlar · Su · Raf |
| The board on the office wall | work board | pano |

Product names stay as they are: AgentOffice, Claude, Claude Code, Codex, GPT, Windows, Wi-Fi, Caps Lock.
