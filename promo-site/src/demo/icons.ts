// The app's icons, with one change for the promo site: the AI tools' logos are replaced by small
// neutral text labels ("Cl" for Claude, "Cx" for Codex). The site never shows those brands' marks.
import { icon } from '@app/ui/icons';
export { icon };
export const mark = (name: 'claude' | 'openai', size = 16) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><text x="12" y="16.2" text-anchor="middle" font-family="system-ui,'Segoe UI',sans-serif" font-size="11.5" font-weight="700" fill="currentColor" letter-spacing="-.3">${name === 'claude' ? 'Cl' : 'Cx'}</text></svg>`;
