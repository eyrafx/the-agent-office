// The GitHub release text for one version: its section of CHANGELOG.md, then the Turkish one from
// CHANGELOG_TR.md folded under "Türkçe", then how to check the download.
//
//   node scripts/release-notes.mjs 0.9.0 [installer-file-name] [sha256]
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const [version, installer, sha256] = process.argv.slice(2);
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) { console.error('Usage: node scripts/release-notes.mjs <version> [installer] [sha256]'); process.exit(2); }

// A version's section: from its "## 0.9.0" heading to the next "## " heading, heading left out.
function section(file) {
  const lines = readFileSync(join(root, file), 'utf8').split(/\r?\n/);
  const start = lines.findIndex(l => l.startsWith(`## ${version} `) || l === `## ${version}`);
  if (start < 0) throw new Error(`${file} has no "## ${version}" section`);
  const end = lines.findIndex((l, i) => i > start && l.startsWith('## '));
  return lines.slice(start + 1, end < 0 ? undefined : end).join('\n').trim();
}

const parts = [section('CHANGELOG.md'), '', '<details><summary>Türkçe</summary>', '', section('CHANGELOG_TR.md'), '', '</details>'];
if (installer) {
  parts.push('', '---', '', `**Download:** \`${installer}\` below. It installs for your Windows user only and needs no administrator rights.`);
  if (sha256) parts.push('', `SHA-256: \`${sha256}\``);
  parts.push('', 'The installer is not code-signed, so Windows SmartScreen may ask for confirmation ("More info" › "Run anyway"). The Microsoft Store version, once published, is signed by the Store and installs without that step.');
}
process.stdout.write(parts.join('\n') + '\n');
