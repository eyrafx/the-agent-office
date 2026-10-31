// Everything on the site that will change later lives here: wallet addresses, the feedback route,
// the hardware figures and the download links. Edit this file only; support.js reads it.
window.AO_CONFIG = {
  // Support wallets (all real). A wallet whose address is left empty is shown as "Address coming soon".
  // `network` is shown under the coin name (translated when it is one of the site's phrases).
  // `notes` are short lines under the address; each must be one of the site's phrases (wallet-copy.mjs) to be translated.
  wallets: [
    { id: 'usdt', coin: 'USDT', network: 'Tron (TRC-20)', address: 'TC8iM6Gke8mVW33npzhQs2B4bLgTJfLqt8', color: '#26a17b',
      notes: ['This address accepts only Tron (TRC-20).'] },
    { id: 'btc', coin: 'BTC', network: 'Bitcoin network', address: 'bc1qu4tll4k96ma7z7t5pwxj8lu72mgys0tnl7smdh', color: '#f7931a',
      notes: ['This address accepts only the Bitcoin network.'] },
    { id: 'eth', coin: 'ETH', network: 'Ethereum network (ERC-20)', address: '0xBAa6A7Dd263967f88316cd533055A7F929F0d8b4', color: '#8c8cf0',
      notes: ['This address accepts only Ethereum (ERC-20).', 'Transfers sent directly from a regular wallet arrive safely; those made through smart contracts may not.'] },
  ],

  // Feedback and contact. There is no backend: nothing is posted anywhere.
  //   mode 'mailto' → the visitor's email app opens with the message filled in (to `email`).
  //   mode 'soon'   → the button says sending is coming soon.
  //   telegram / telegramLabel / issues: the contact links under the form (Telegram, GitHub Issues for bugs).
  feedback: { mode: 'mailto', email: 'eyra@hotmail.com.tr', subject: 'The Agent Office feedback', telegram: 'https://t.me/eyrafx', telegramLabel: '@eyrafx', issues: 'https://github.com/eyrafx/agentoffice/issues' },

  // Hardware use. APPROXIMATE values from our own measurements (28 Oct 2026); edit freely.
  //   idleCpuPercent: measured ~5.9% of one core at idle; the planned cut targets under 1%, shown as "~1%".
  //   memoryMB: roughly 150 MB while running.
  //   downloadMB: AgentOffice_0.1.0_x64-setup.exe is 9,047,566 bytes ≈ 9 MB.
  usage: { approximate: true, memoryMB: 150, idleCpuPercent: 1, downloadMB: 9 },

  // Download links. Empty means "not published yet": the button is shown inactive with a "soon" note.
  //   storeUrl:     the Microsoft Store listing, e.g. 'https://apps.microsoft.com/detail/<id>'
  //   installerUrl: the .exe installer, e.g. 'https://example.com/AgentOffice_0.1.0_x64-setup.exe'
  //   sha256:       the installer's SHA-256 fingerprint (64 hex characters). Hidden on the page while empty.
  download: { storeUrl: '', installerUrl: '', sha256: '' },

  // The developer's note near the download: the name it is signed with.
  note: { signer: 'eyra' },
};
