// Privacy policy. Store Hazırlık's text of 1 Nov 2026, checked against the app's code (e91e4d0); the only
// internet requests are the ones listed under "Internet requests". English and Turkish only for now:
// the other site languages show the English text (legal.js falls back to `en` and marks the page as English).
window.AO_LEGAL = {
en: { title: 'Privacy policy', updated: '1 November 2026',
  intro: ['The Agent Office is a free, open-source Windows app that runs on your computer. It needs no account, shows no ads and collects no usage statistics (telemetry). We have no server, and nothing about you is sent to us.'],
  sections: [
    { h: 'What stays on your computer', p: ['Your settings, notes, to-dos, alarms and reminders, water log, the locations of files on the file shelf, office names, the work board, saved lyrics and saved site icons are kept only on this computer, in the app’s own data folder under <code>%LOCALAPPDATA%</code>. The file shelf never copies or uploads files; it only remembers where they are. When you uninstall the Microsoft Store version, Windows removes this data.'] },
    { h: 'Local files it reads', items: [
      '<b>Claude Code:</b> chat records in <code>%USERPROFILE%\\.claude\\projects</code> and the Claude desktop app’s chat list: the chat’s title, working folder, the first sentence of the last reply, its state and the link that opens the chat. Read only.',
      '<b>Codex:</b> session records in <code>%USERPROFILE%\\.codex\\sessions</code>, read only. Codex usage limits shown in the app come from these records.',
      '<b>Claude usage limits:</b> read only from a local file, <code>%LOCALAPPDATA%\\AgentOffice\\claude-usage.json</code>, which a Claude chat writes when you use the optional skill pack (for example, a manager chat). The app never reads your Claude sign-in and never contacts an online service for these limits.',
      '<b>Windows itself:</b> what is playing (title, artist, artwork), battery, sound output, Wi-Fi name, keyboard language and Caps Lock. These are only shown on screen. When media plays in a Chromium-based browser, the app reads that tab’s address bar through Windows UI Automation (read only) to know which site is playing.'] },
    { h: 'What it writes, and only when you choose', items: [
      '<b>Connect:</b> only when you choose Connect, The Agent Office adds its own entries to Claude Code’s settings (<code>%USERPROFILE%\\.claude\\settings.json</code>), Codex’s <code>hooks.json</code> or Cursor’s <code>%USERPROFILE%\\.cursor\\hooks.json</code>. A backup is made first and your other settings are left alone. Disconnect removes these entries.',
      '<b>Helper:</b> Connect also places a small helper program in <code>%USERPROFILE%\\.agentoffice\\bin</code>. Those tools run it to pass events to the app over a local named pipe on your computer.',
      '<b>Skill pack (optional):</b> from Settings you can install a skill pack into the AI tools’ own skill folders.',
      'Nothing The Agent Office adds ever approves a question or a tool permission for you.',
      '<b>Before uninstalling:</b> uninstalling the Microsoft Store app does not remove these tool entries or the helper. Settings suggests choosing Disconnect first.'] },
    { h: 'Internet requests (the complete list)', items: [
      '<b>Weather (optional, off at first):</b> the city name you type is sent to Open-Meteo’s geocoding service (<code>geocoding-api.open-meteo.com</code>) to find it. The chosen city’s coordinates are then sent to <code>api.open-meteo.com</code> for the forecast and to <code>aviationweather.gov</code> (the US NOAA Aviation Weather Center) for the nearest airport’s METAR weather report. This happens at most about every 30 minutes. Your device location is never read.',
      '<b>Lyrics (optional, off at first):</b> the playing track’s title, artist, album and length are sent to <code>lrclib.net</code> (LRCLIB). Lyrics found are saved on your computer.',
      '<b>Icon for media playing in a browser:</b> that site’s own page and icon are fetched from that site only, never from a third party.',
      '<b>WebView2:</b> if the Microsoft Edge WebView2 Runtime is missing, the app asks you before opening Microsoft’s download page.'] },
    { p: ['That is all. There is no update check, no request to GitHub and no crash reporting. Links you click open in your own browser.'] },
    { h: 'Microsoft Store and this website', items: [
      'Downloads and updates through the Microsoft Store are handled by Microsoft under the Microsoft privacy statement.',
      'This website is served by GitHub Pages, which may keep standard server logs.'] },
    { h: 'Children and sharing', p: ['We do not sell or share your data; it never reaches us. Requests to the services listed above follow those services’ own privacy policies. The Agent Office is not directed at children and asks no one for personal information.'] },
    { h: 'Changes and contact', p: ['If this policy changes, this page and its date are updated. For questions and suggestions, write in <a href="https://github.com/eyrafx/the-agent-office/discussions">GitHub Discussions</a>. Report bugs in <a href="https://github.com/eyrafx/the-agent-office/issues">GitHub Issues</a>. GitHub is the only contact channel.'] },
  ] },
tr: { title: 'Gizlilik politikası', updated: '1 Kasım 2026',
  intro: ['The Agent Office, bilgisayarında çalışan ücretsiz ve açık kaynaklı bir Windows uygulamasıdır. Hesap istemez, reklam göstermez, kullanım istatistiği (telemetri) toplamaz. Bir sunucumuz yok; senin hakkında bize hiçbir şey gönderilmez.'],
  sections: [
    { h: 'Bilgisayarında kalanlar', p: ['Ayarların, notların, yapılacakların, alarm ve hatırlatıcıların, su kaydın, dosya rafındaki dosyaların yerleri, ofis adları, iş panosu, saklanan şarkı sözleri ve saklanan site simgeleri yalnız bu bilgisayarda, uygulamanın <code>%LOCALAPPDATA%</code> altındaki kendi veri klasöründe tutulur. Dosya rafı dosyaları kopyalamaz ya da yüklemez; yalnız yerlerini hatırlar. Microsoft Store sürümünü kaldırdığında bu veriyi Windows siler.'] },
    { h: 'Okunan yerel dosyalar', items: [
      '<b>Claude Code:</b> <code>%USERPROFILE%\\.claude\\projects</code> içindeki sohbet kayıtları ve Claude masaüstü uygulamasının sohbet listesi: sohbetin başlığı, çalışma klasörü, son yanıtın ilk cümlesi, durumu ve sohbeti açan bağlantı. Yalnız okunur.',
      '<b>Codex:</b> <code>%USERPROFILE%\\.codex\\sessions</code> içindeki oturum kayıtları, yalnız okunur. Uygulamada görünen Codex kullanım sınırları da bu kayıtlardan gelir.',
      '<b>Claude kullanım sınırları:</b> yalnız yerel bir dosyadan, <code>%LOCALAPPDATA%\\AgentOffice\\claude-usage.json</code> dosyasından okunur. Bu dosyayı, isteğe bağlı beceri paketini kullandığında bir Claude sohbeti (örneğin bir yönetici sohbeti) yazar. Uygulama Claude oturum bilgini hiç okumaz ve bu sınırlar için hiçbir çevrim içi servise bağlanmaz.',
      '<b>Windows’un kendisi:</b> çalan medya (ad, sanatçı, kapak), pil, ses çıkışı, Wi-Fi adı, klavye dili ve Caps Lock. Bunlar yalnız ekranda gösterilir. Medya Chromium tabanlı bir tarayıcıda çalıyorsa, hangi sitede çaldığını anlamak için o sekmenin adres çubuğu Windows UI Automation ile okunur (yalnız okuma).'] },
    { h: 'Yazdıkları, yalnız sen seçersen', items: [
      '<b>Bağla:</b> yalnız sen Bağla dediğinde The Agent Office kendi girdilerini Claude Code ayarlarına (<code>%USERPROFILE%\\.claude\\settings.json</code>), Codex’in <code>hooks.json</code> dosyasına ya da Cursor’un <code>%USERPROFILE%\\.cursor\\hooks.json</code> dosyasına ekler. Önce yedek alınır, diğer ayarlarına dokunulmaz. Bağlantıyı kaldır bu girdileri siler.',
      '<b>Yardımcı program:</b> Bağla ayrıca <code>%USERPROFILE%\\.agentoffice\\bin</code> içine küçük bir yardımcı program koyar. Bu araçlar onu çalıştırarak olayları bilgisayarındaki yerel bir adlandırılmış kanal (named pipe) üzerinden uygulamaya iletir.',
      '<b>Beceri paketi (isteğe bağlı):</b> Ayarlar’dan yapay zekâ araçlarının kendi beceri klasörlerine bir beceri paketi kurabilirsin.',
      'The Agent Office’in eklediği hiçbir şey bir soruyu ya da araç iznini senin yerine onaylamaz.',
      '<b>Kaldırmadan önce:</b> Microsoft Store uygulamasını kaldırmak bu araç girdilerini ve yardımcı programı silmez. Ayarlar, kaldırmadan önce Bağlantıyı kaldır’ı seçmeni önerir.'] },
    { h: 'İnternete giden istekler (tam liste)', items: [
      '<b>Hava durumu (isteğe bağlı, kapalı başlar):</b> yazdığın şehir adı, bulunması için Open-Meteo’nun konum arama servisine (<code>geocoding-api.open-meteo.com</code>) gönderilir. Seçtiğin şehrin koordinatları sonra tahmin için <code>api.open-meteo.com</code> adresine ve en yakın havalimanının METAR hava raporu için <code>aviationweather.gov</code> adresine (ABD NOAA Havacılık Hava Durumu Merkezi) gönderilir. Bu en çok yaklaşık 30 dakikada bir olur. Cihazının konumu hiç okunmaz.',
      '<b>Şarkı sözleri (isteğe bağlı, kapalı başlar):</b> çalan parçanın adı, sanatçısı, albümü ve süresi <code>lrclib.net</code> (LRCLIB) adresine gönderilir. Bulunan sözler bilgisayarında saklanır.',
      '<b>Tarayıcıda çalan medyanın simgesi:</b> o sitenin kendi sayfası ve simgesi yalnız o siteden alınır, hiçbir zaman üçüncü bir taraftan değil.',
      '<b>WebView2:</b> Microsoft Edge WebView2 Çalışma Zamanı eksikse uygulama, Microsoft’un indirme sayfasını açmadan önce sana sorar.'] },
    { p: ['Hepsi bu kadar. Güncelleme denetimi yok, GitHub’a istek yok, çökme raporu gönderimi yok. Tıkladığın bağlantılar kendi tarayıcında açılır.'] },
    { h: 'Microsoft Store ve bu site', items: [
      'Microsoft Store üzerinden indirme ve güncellemeleri Microsoft, kendi gizlilik bildirimine göre yürütür.',
      'Bu site GitHub Pages üzerinden sunulur; GitHub olağan sunucu kayıtlarını tutabilir.'] },
    { h: 'Çocuklar ve paylaşım', p: ['Verini satmıyor ya da paylaşmıyoruz; zaten bize gelmiyor. Yukarıdaki servislere giden istekler o servislerin kendi gizlilik politikalarına tabidir. The Agent Office çocuklara yönelik değildir ve kimseden kişisel bilgi istemez.'] },
    { h: 'Değişiklikler ve iletişim', p: ['Bu politika değişirse bu sayfa ve tarihi güncellenir. Soruların ve önerilerin için <a href="https://github.com/eyrafx/the-agent-office/discussions">GitHub Discussions</a> üzerinden yazabilirsin. Hataları <a href="https://github.com/eyrafx/the-agent-office/issues">GitHub Issues</a> üzerinden bildirebilirsin. Tek iletişim kanalı GitHub’dır.'] },
  ] },
};
