<p align="center"><a href="README.md">English</a> | <b>Türkçe</b></p>

# AgentOffice

**Windows için bir dinamik ada ve yapay zekâ ajanların için küçük bir ofis.**

<!-- İndirme düğmesi: site "yakında" dediği sürece düğme de öyle der.
     Kurulum dosyası yayımlanınca "İndir%20(yak%C4%B1nda)" yerine "Windows%20i%C3%A7in%20indir" yazın. -->
<p align="center">
  <a href="https://eyrafx.github.io/agentoffice/#download"><img src="https://img.shields.io/badge/%C4%B0ndir%20(yak%C4%B1nda)-Windows%2010%20%7C%2011-0078D4?style=for-the-badge" alt="Windows için indir (yakında)"></a>
  <a href="https://eyrafx.github.io/agentoffice/"><img src="https://img.shields.io/badge/Web%20sitesi-canl%C4%B1%20demo-F27B35?style=for-the-badge&logo=googlechrome&logoColor=white" alt="Web sitesi ve canlı demo"></a>
  <a href="https://eyrafx.github.io/agentoffice/#support"><img src="https://img.shields.io/badge/Destek-ol-E5498F?style=for-the-badge&logo=githubsponsors&logoColor=white" alt="Projeye destek ol"></a>
</p>
<p align="center">
  <a href="LICENSE"><img src="https://img.shields.io/badge/kod-MIT-informational" alt="Kod: MIT"></a>
  <a href="LICENSE-ASSETS.md"><img src="https://img.shields.io/badge/adlar%20ve%20g%C3%B6rseller-t%C3%BCm%20haklar%C4%B1%20sakl%C4%B1-lightgrey" alt="Adlar ve görseller: tüm hakları saklı"></a>
</p>

AgentOffice'in adası Octolantis, ahtapot maskotu Octo ile birlikte ekranının üst kenarında durur ve kodlama ajanlarının ne yaptığını gösterir: kim çalışıyor, kim senden yanıt bekliyor, kullanım sınırından ne kadar kaldı. Ofisi açtığında her sohbeti, projesine göre gruplanmış, masasında oturan bir çalışma arkadaşı olarak görürsün.

<!-- TANITIM VİDEOSU / GIF (eklenecek): ada ve ofis hareket halinde, yalnız örnek verilerle.
<p align="center">
  <img src="docs/media/hero.gif" alt="AgentOffice: ada açılıyor, ofis çalışıyor" width="720">
</p>
-->

<!-- EKRAN GÖRÜNTÜLERİ (eklenecek, 3–4 adet, yalnız örnek verilerle):
<p align="center">
  <img src="docs/media/island.png" alt="Ekranın üstündeki ada" width="360">
  <img src="docs/media/office.png" alt="Masalarında ajanların olduğu ofis" width="360">
  <img src="docs/media/limits.png" alt="Claude ve Codex kullanım sınırları" width="360">
  <img src="docs/media/pages.png" alt="Adanın medya, not ve odak sayfaları" width="360">
</p>
-->

## Özellikler

- **Ajanlar bir bakışta**: çalışan, seni bekleyen ve boştaki oturumlar, en yenisi önde; sorular ve izin istekleri en üste çıkar.
- **Ofis**: her proje bir ofis, her sohbet masasındaki bir ajan; yönetici odanın başında oturur.
- **Kullanım sınırları**: Claude ve Codex'in 5 saatlik ve haftalık sınırları, sıfırlanma saatleriyle.
- **Yerinde aç**: bir oturuma tıkla, Claude'da ya da Codex'te o sohbete git. AgentOffice senin yerine hiçbir soruyu yanıtlamaz, hiçbir izni onaylamaz.
- **Adanın diğer sayfaları**: eş zamanlı şarkı sözleriyle medya denetimi (isteğe bağlı), notlar ve yapılacaklar, odak zamanlayıcısı ve geri sayım, alarmlar, su hatırlatıcısı.
- **Windows için yapıldı**: tam ekran uygulamaların önüne geçmez, monitörünü ve DPI ayarını izler, istersen Windows ile başlar.
- **11 dil**: English, Türkçe, Deutsch, Español, Français, Italiano, Português (Brasil), Русский, 日本語, 한국어, 简体中文.

## Desteklenen araçlar

| Araç | AgentOffice onu nasıl izler |
|---|---|
| Claude Code (terminal, IDE, Claude masaüstü uygulaması) | Claude Code ayarlarına eklenen küçük bir hook aktarıcısı (Ayarlar'dan kaldırılabilir) |
| Codex (CLI ve masaüstü uygulaması) | Codex'in kendi oturum dosyalarını ve proje listesini yalnız okur |
| Cursor | Cursor'ın hook ayarlarına eklenen bir hook aktarıcısı (kaldırılabilir) |

Başka araçlar ancak davranışları doğrulanabildiğinde eklenir. "Her yapay zekâ uygulamasıyla çalışır" gibi bir iddia yoktur.

## Kurulum

- **Microsoft Store**: *(yayımlanınca bağlantı eklenecek)*
- **Kurulum dosyası** *(yakında)*: `AgentOffice_x.y.z_x64-setup.exe`, SHA-256 özetiyle birlikte [Releases](https://github.com/eyrafx/agentoffice/releases) sayfasında yayımlanacak. Kullanıcıya özel kurulur, yönetici yetkisi gerekmez.
- Windows 10 ya da 11 ve Microsoft Edge WebView2 Runtime gerekir (çoğu bilgisayarda zaten vardır).

### Kaynaktan derleme

Gerekenler: Windows 10/11, Node.js 20+, Visual Studio C++ Build Tools. Rust, `scripts/install-local-rust.ps1` ile proje klasörünün içine kurulabilir.

```powershell
npm --prefix app ci
npm --prefix app run build                        # arayüz; Rust derlemesinden önce gerekir
powershell -File scripts/dev.ps1 -Action test     # arayüz testleri, hook aktarıcısı, Rust testleri
powershell -File scripts/dev.ps1 -Action native   # uygulamayı çalıştır
powershell -File scripts/dev.ps1 -Action bundle   # kurulum dosyasını oluştur
```

`scripts/dev.ps1` Rust'ı, önbellekleri, derleme çıktısını ve uygulamanın test verisini proje klasörünün içinde tutar (`.tools/`, `.artifacts/`, `.local-data/`); böylece geliştirme sürümü kurulu bir AgentOffice'e hiç dokunmaz.

## Depo düzeni

| Klasör | Ne var |
|---|---|
| `app/` | Masaüstü uygulaması: TypeScript arayüzü (`app/src`), Rust/Tauri 2 kabuğu (`app/src-tauri`), hook aktarıcısı (`app/hook`), testler (`app/tests`, `app/src-tauri/tests`) |
| `site/` | [eyrafx.github.io/agentoffice](https://eyrafx.github.io/agentoffice/) adresindeki web sitesi. `site/dist/` yayımlanan statik sitedir; bkz. [site/README.md](site/README.md) |
| `promo-site/` | Tanıtım videolarını çekmek için kullanılan, ada ve ofisin küçük bir tarayıcı demosu |
| `promo-video/` | Tanıtım videolarını kaydeden ve oluşturan betikler (videoların kendisi depoda yok) |
| `design/` | Maskot ve ofis görsellerini hazırlayan betikler |
| `scripts/` | Geliştirme yardımcıları (`dev.ps1`, yerel Rust kurulumu) |
| `licenses/` | Kurulum dosyasıyla dağıtılan lisans metinleri |

## Gizlilik

- Her şey senin bilgisayarında çalışır. Hesap yok, analiz yok, AgentOffice sunucusu yok.
- Sohbet içerikleri hiçbir yere yüklenmez. AgentOffice yalnız durumu göstermek için gerekeni okur: oturum olayları, başlıklar ve proje adları.
- Claude sınırlarını göstermek için bilgisayarındaki mevcut Claude Code oturumunu kullanarak Anthropic'in kullanım servisine sorar; erişim anahtarı asla saklanmaz, kaydedilmez ya da başka yere gönderilmez.
- Eş zamanlı şarkı sözleri (LRCLIB) ve hava durumu (Open-Meteo) sen açana kadar kapalıdır. Site simgeleri açık olan sitenin kendisinden alınır, asla üçüncü taraf bir simge servisinden alınmaz.
- Kurulum dosyasının kaldırıcısı AgentOffice'in hook'larını Claude Code ve Cursor'dan siler. Store sürümünde kaldırmadan önce bağlantıyı Ayarlar › Gelişmiş'ten kapat.

Tam metin: [Gizlilik](https://eyrafx.github.io/agentoffice/privacy.html)

## Lisans

- **Kod**: [MIT](LICENSE), © 2026 eyra.
- **Adlar, maskot ve görseller**: "AgentOffice", "Octolantis" ve "Octo" adları, Octo maskotu, ofis çizimleri, simge ve diğer tüm görseller, animasyonlar ve videolar MIT kapsamında **değildir**; tüm hakları saklıdır. Bkz. [LICENSE-ASSETS.md](LICENSE-ASSETS.md) (İngilizce). Çatallar kendi adları ve görselleriyle memnuniyetle karşılanır.
- **Üçüncü taraf parçalar**: [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md) ([Coucou](https://github.com/Louis-CFM/coucou)'dan uyarlanan MIT kod dahil).

AgentOffice bağımsız bir projedir; Anthropic, OpenAI, Anysphere (Cursor) ya da Microsoft ile bağlantılı değildir ve onlar tarafından onaylanmamıştır. Ürün adları sahiplerine aittir.

## Destek

AgentOffice ücretsizdir. İşine yarıyorsa [destek sayfasından](https://eyrafx.github.io/agentoffice/#support) kripto bağışla geliştirmeye katkıda bulunabilirsin. Hata bildirimleri ve fikirler için: [Issues](https://github.com/eyrafx/agentoffice/issues).
