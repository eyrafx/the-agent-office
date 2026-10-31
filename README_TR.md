# AgentOffice

**Windows** için bir dinamik ada ve yapay zekâ kodlama ajanların için küçük bir ofis.

## İndir

<!-- Site "yakında" dediği sürece bu bağlantı da öyle der. Kurulum dosyası yayımlanınca
     yazıyı "⬇ AgentOffice vX.Y.Z'yi indir" yapın ve bağlantıyı sürüm dosyasına yönlendirin. -->
**[⬇ AgentOffice'i indir (yakında)](https://eyrafx.github.io/agentoffice/#download)**

<!-- Demo videosu yayımlanınca "▶ Demoyu İzle (yakında)" yazısını videoya bağlayın. -->
▶ Demoyu İzle *(yakında)* · [Web sitesi ve canlı demo](https://eyrafx.github.io/agentoffice/) · [English README](README.md)

> **Bağımsız bir projedir.** AgentOffice'in Microsoft, Anthropic, OpenAI ya da Anysphere (Cursor) ile resmi bir bağlantısı yoktur ve onlar tarafından desteklenmemektedir. Ürün adları sahiplerine aittir.

---

## AgentOffice nedir?

AgentOffice ekranının üst kenarında durur ve kodlama ajanlarının ne yaptığını gösterir: kim çalışıyor, kim senden yanıt bekliyor, kullanım sınırından ne kadar kaldı. Ofisi açtığında her sohbet, projesine göre gruplanmış, masasında oturan bir çalışma arkadaşına dönüşür. Her şey senin bilgisayarında çalışır; hesap yok, AgentOffice sunucusu yok.

Adanın adı **Octolantis**; orada yaşayan küçük turuncu ahtapot **Octo** da sana eşlik eder.

## Özellikler

- Ajanlar bir bakışta: çalışan, seni bekleyen ve boştaki oturumlar, en yenisi önde
- Sorular ve izin istekleri en üste çıkar
- Ofis: her proje bir ofis, her sohbet masasındaki bir ajan, yönetici odanın başında
- Claude ve Codex kullanım sınırları (5 saatlik ve haftalık), sıfırlanma saatleriyle
- Bir oturuma tıkla, Claude'da ya da Codex'te aç
- Senin yerine hiçbir soruyu yanıtlamaz, hiçbir izni onaylamaz
- İsteğe bağlı eş zamanlı şarkı sözleriyle medya denetimi
- Notlar ve yapılacaklar, odak zamanlayıcısı ve geri sayım
- Alarmlar, hatırlatıcılar ve su hatırlatıcısı
- Dosya rafı: dosyaları topla, sonra istediğin uygulamaya sürükle
- Küçük adada hava durumu ve pil
- Cam ya da koyu görünüm; masaüstü, uygulamalar ve tarayıcı için ayrı dinlenme görünümü
- Tam ekran uygulamaların önüne geçmez, monitörünü ve DPI ayarını izler
- İstersen Windows ile birlikte, sessizce bildirim alanında başlar
- 11 dil

## Desteklenen araçlar

| Araç | AgentOffice onu nasıl izler |
|---|---|
| Claude Code (terminal, IDE, Claude masaüstü uygulaması) | Claude Code ayarlarına eklenen küçük bir hook aktarıcısı (Ayarlar'dan kaldırılabilir) |
| Codex (CLI ve masaüstü uygulaması) | Codex'in kendi oturum dosyalarını ve proje listesini yalnız okur |
| Cursor | Cursor'ın hook ayarlarına eklenen bir hook aktarıcısı (kaldırılabilir) |

Başka araçlar ancak davranışları doğrulanabildiğinde eklenir.

## Kontroller

| Kontrol | İşlev |
|---|---|
| Adanın üzerine gel (ya da üst kenara dokun) | Adayı aç |
| İmleci uzaklaştır | Adayı kapat |
| `Ctrl+Alt+Space` | Adayı aç (Ayarlar'dan değiştirilebilir) |
| `Ctrl+Alt+M` | Sesi kapat (Ayarlar'dan değiştirilebilir) |
| Yatay sürükleme, tekerlek ya da dokunmatik yüzey kaydırması | Adanın sayfalarını çevir |
| Bir oturuma ya da bekleyen soruya tıkla | O sohbeti Claude'da ya da Codex'te aç |
| Adanın üst kısmındaki tutamacı sürükle | Adayı üst kenar boyunca taşı |
| Tutamaca çift tıkla | Adayı ortala |
| Raf: dosyayı sürükle / tıkla | Bir uygulamaya bırak / aç |
| Ofis: yöneticinin masasına tıkla | Ofisin yöneticisini seç |
| İmleci Octo'ya getir | Octo sana bakar |
| Bildirim alanı simgesi | Ofisi aç, Ayarlar, Sesi kapat, Çık |

## Ekran görüntüleri

<!-- Görseller assets/screenshots/ klasörüne gelecek (yalnız örnek veriler). Dosyası eklenince ilgili satırın yorumunu kaldırın. -->

### Ada

<!-- ![Ekranın üstündeki ada](assets/screenshots/1-island.png) -->

### Ofis

<!-- ![Masalarında ajanların olduğu ofis](assets/screenshots/2-office.png) -->

### Kullanım sınırları

<!-- ![Claude ve Codex kullanım sınırları](assets/screenshots/3-limits.png) -->

### Adanın sayfaları

<!-- ![Medya, not ve odak sayfaları](assets/screenshots/4-pages.png) -->

## Kurulum

1. Yukarıdaki indirme bağlantısından **AgentOffice_x.y.z_x64-setup.exe** dosyasını indir *(yakında)*.
2. Kurulum dosyasını çalıştır. Kullanıcıya özel kurulum yönetici yetkisi istemez.
3. AgentOffice açılır. İlk açılış ekranı Claude Code, Codex ve Cursor'ı bulur ve tek adımda bağlar.
4. Adayı açmak için imleci ekranın üst kenarına getir; ofisi adadan ya da bildirim alanı simgesinden aç.

Microsoft Store sürümü planlanıyor.

## Diller

- İngilizce
- Türkçe
- Almanca
- İspanyolca
- Fransızca
- İtalyanca
- Portekizce (Brezilya)
- Rusça
- Japonca
- Korece
- Basitleştirilmiş Çince

## Gereksinimler

- Windows 10 ya da 11 (64 bit)
- Microsoft Edge WebView2 Runtime (çoğu bilgisayarda zaten vardır)
- Ajan özellikleri için Claude Code, Codex ya da Cursor (adanın diğer sayfaları bunlar olmadan da çalışır)

## Kaldırma

AgentOffice'i Windows'ta **Yüklü uygulamalar** listesinden kaldır. Kaldırıcı, AgentOffice'in Claude Code ve Cursor'a eklediği hook'ları da siler; ajanlarına ve ayarlarına başka hiçbir şekilde dokunmaz.

Store sürümünde kaldırmadan önce bağlantıyı Ayarlar › Gelişmiş'ten kapat.

## Gizlilik

- Hesap yok, analiz yok, AgentOffice sunucusu yok.
- Sohbet içerikleri hiçbir yere yüklenmez; AgentOffice yalnız oturum olaylarını, başlıkları ve proje adlarını okur.
- Claude sınırları için bilgisayarındaki mevcut Claude Code oturumuyla Anthropic'in kullanım servisine sorulur; erişim anahtarı asla saklanmaz, kaydedilmez ya da başka yere gönderilmez.
- Eş zamanlı şarkı sözleri (LRCLIB) ve hava durumu (Open-Meteo) sen açana kadar kapalıdır.

Tam metin: [Gizlilik](https://eyrafx.github.io/agentoffice/privacy.html)

## Kaynaktan derleme

Gerekenler: Windows 10/11, Node.js 20+, Visual Studio C++ Build Tools. Rust, `scripts/install-local-rust.ps1` ile proje klasörünün içine kurulabilir.

```powershell
npm --prefix app ci
npm --prefix app run build                        # arayüz; Rust derlemesinden önce gerekir
powershell -File scripts/dev.ps1 -Action test     # arayüz testleri, hook aktarıcısı, Rust testleri
powershell -File scripts/dev.ps1 -Action native   # uygulamayı çalıştır
powershell -File scripts/dev.ps1 -Action bundle   # kurulum dosyasını oluştur
```

`scripts/dev.ps1` Rust'ı, önbellekleri, derleme çıktısını ve test verisini proje klasörünün içinde tutar (`.tools/`, `.artifacts/`, `.local-data/`); böylece geliştirme sürümü kurulu bir AgentOffice'e hiç dokunmaz.

| Klasör | Ne var |
|---|---|
| `app/` | Masaüstü uygulaması: TypeScript arayüzü, Rust/Tauri 2 kabuğu, hook aktarıcısı, testler |
| `site/` | Web sitesi; GitHub Pages `site/dist/` klasörünü yayımlar ([site/README.md](site/README.md)) |
| `promo-site/`, `promo-video/` | Tanıtım videolarını çekmek için kullanılan tarayıcı demosu ve betikler |
| `design/` | Maskot ve ofis görsellerini hazırlayan betikler |
| `scripts/` | Geliştirme yardımcıları |
| `licenses/` | Kurulum dosyasıyla dağıtılan lisans metinleri |

## Katkı

Hata bildirimleri, fikirler ve pull request'ler memnuniyetle karşılanır: [Issues](https://github.com/eyrafx/agentoffice/issues).

## Destek

AgentOffice ücretsizdir. İşine yarıyorsa [destek sayfasından](https://eyrafx.github.io/agentoffice/#support) destek olabilirsin.

## Lisans

- **Kod**: [MIT Lisansı](LICENSE), © 2026 eyra.
- **Adlar, maskot ve görseller**: "AgentOffice", "Octolantis" ve "Octo" adları, Octo maskotu, ofis çizimleri, simge ve diğer tüm görseller, animasyonlar ve videolar MIT kapsamında **değildir**; tüm hakları saklıdır. Bkz. [LICENSE-ASSETS.md](LICENSE-ASSETS.md) (İngilizce). Çatallar kendi adları ve görselleriyle memnuniyetle karşılanır.
- **Üçüncü taraf parçalar**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md).

---

**eyra** tarafından yapıldı

GitHub: **[@eyrafx](https://github.com/eyrafx)**  
Telegram: **[@eyrafx](https://t.me/eyrafx)**
