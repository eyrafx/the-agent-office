// Every word on the promo page, by key. Turkish is the page's language; an English catalog can be
// filled in later (any key it lacks falls back to Turkish). Open the page with ?lang=en to use it.
// The live islands follow the app's own i18n (app/src/i18n), set to the same language.

export const tr = {
  'meta.title': 'AgentOffice — Ajanların ekranın tepesinde',
  'skip': 'İçeriğe geç',
  'nav.features': 'Özellikler',
  'nav.office': 'Ofis',
  'nav.download': 'İndir',
  'nav.home': 'AgentOffice ana sayfa',

  'hero.eyebrow': 'Windows için · Claude ve Codex ajanları',
  'hero.title': 'Ajanların,<br>ekranın tepesinde.',
  'hero.lead': 'AgentOffice, kodlama ajanlarını ekranın üst kenarındaki küçük bir adada toplar. Kim çalışıyor, kim seni bekliyor: tek bakışta. Soru gelince ada kendiliğinden açılır.',
  'hero.cta': 'Windows için indir',
  'hero.cta.note': 'Yakında',
  'hero.try': 'Canlı denemeye geç',
  'hero.hint': 'Adanın üstüne gel ya da tıkla',
  'hero.hint.touch': 'Adaya dokun',
  'hero.live': 'Canlı: uygulamanın kendi kodu, örnek verilerle',

  'trio.1.t': 'Hiçbir soru kaçmaz',
  'trio.1.d': 'Bir ajan seni beklediğinde ada açılır, rozet yanar.',
  'trio.2.t': 'Akışı bozmaz',
  'trio.2.d': 'Kapalıyken yalnız saat, maskot ve küçük bir sayı.',
  'trio.3.t': 'Her şey tek adada',
  'trio.3.d': 'Medya, notlar, odak, alarm, su ve dosya rafı.',

  'rail.label': 'Bölümler',
  'try': 'Dene',

  'agents.kicker': '01 · Ajanlar',
  'agents.title': 'Kim çalışıyor, kim seni bekliyor.',
  'agents.lead': 'Çalışan, yanıt bekleyen ve boştaki ajanlar tek listede. Bir ajan soru sorduğunda kartı en üste gelir; yanıtı ofisteki balondan verirsin.',
  'agents.try.1': 'Karttaki “Ofiste yanıtla”ya bas',
  'agents.try.2': 'Çalışıyor · Seni bekliyor · Boşta arasında geç',
  'agents.ask': 'Yeni bir soru gelsin',
  'agents.asked': 'Soru geldi: ada açıldı',

  'office.kicker': '02 · Ofis',
  'office.title': 'Ajanların, sıcacık bir ofiste.',
  'office.lead': 'Her proje bir ofis, her ajan bir masa. Çalışan klavyeye gömülür, yanıt bekleyen el kaldırır, işi biten kahve köşesine gider. Soru soranın balonuna tıkla, oradan yanıtla.',
  'office.try.1': 'El kaldıran ajanın balonuna tıkla',
  'office.try.2': 'Bir seçenek seçip gönder',
  'office.answered': 'Yanıt gitti: “{answer}”. Ada da güncellendi.',
  'office.frame': 'Canlı ofis sahnesi',
  'office.mobile': 'Ofis geniş ekranda en iyi görünür; burada küçültülmüş gösteriliyor.',

  'media.kicker': '03 · Medya',
  'media.title': 'Çalan şarkı, parmağının ucunda.',
  'media.lead': 'Kapak, süre çubuğu ve denetimler adada. Kapalı adada bile küçük kapak ve ses çubukları görünür.',
  'media.try.1': 'Oynat, duraklat, sonraki parçaya geç',
  'media.try.2': 'Süre çubuğunda ileri sar',
  'media.honest': 'Uygulamada Windows’ta çalan medyayı gösterir. Burada uydurma bir parça ve üretilmiş soyut bir kapak var; ses çalmaz.',

  'notes.kicker': '04 · Notlar',
  'notes.title': 'Aklına geleni hemen yaz.',
  'notes.lead': 'Yapılacaklar ve notlar adada, işin ortasında. Bir yapılacağa saat ekle, zamanı gelince hatırlatsın.',
  'notes.try.1': 'Bir yapılacak yaz, Enter’a bas',
  'notes.try.2': 'İşaretleyip tamamla',

  'focus.kicker': '05 · Odak',
  'focus.title': 'Pomodoro, geri sayım, sessizce.',
  'focus.lead': 'Odak süresini başlat; ada kapalıyken sağda halka halinde akar. Mola zamanı gelince ada açılır.',
  'focus.try.1': 'Odağı başlat, duraklat',
  'focus.try.2': 'Kısa mola ya da geri sayım seç',

  'alarms.kicker': '06 · Alarmlar',
  'alarms.title': 'Alarm ve hatırlatıcı, tek dokunuşla.',
  'alarms.lead': 'Saat ve gün seç, adını yaz. Tekrarlayan günler, erteleme ve kaçırılanlar adada.',
  'alarms.try.1': '“Alarm kur”a bas, saat seç, kaydet',
  'alarms.honest': 'Bu sayfada alarm çalmaz; liste yalnız gösterilir.',

  'water.kicker': '07 · Su takibi',
  'water.title': 'Bir bardak su, bir dokunuş.',
  'water.lead': 'Günlük hedefin ve bardağın adada. İçtikçe dolar; istersen belli aralıklarla hatırlatır.',
  'water.try.1': '“Bir bardak içtim”e bas',

  'shelf.kicker': '08 · Dosya rafı',
  'shelf.title': 'Dosyayı adaya bırak, sonra al.',
  'shelf.lead': 'Bir dosyayı adanın üstüne sürükle; rafta beklesin. Oradan aç, klasörde göster ya da başka bir yere sürükle.',
  'shelf.try.1': 'Aşağıdaki örnek dosyaları adaya sürükle',
  'shelf.try.2': 'ya da “Rafa koy”a bas',
  'shelf.put': 'Rafa koy',
  'shelf.samples': 'Örnek dosyalar',
  'shelf.honest': 'Örnek dosyalar uydurmadır; hiçbir dosya yüklenmez ya da açılmaz. Kendi dosyanı bırakırsan yalnız adı bu sayfada görünür.',

  'win.kicker': 'Yalnız masaüstünde',
  'win.title': 'Windows’ta bir adım daha.',
  'win.lead': 'Bunlar masaüstü uygulamasında çalışır; bu sayfada canlı değildir.',
  'win.1.t': 'Tam ekranın üstünde',
  'win.1.d': 'Oyun ya da sunum tam ekrandayken ada ince bir çizgiye iner, istersen tamamen gizlenir.',
  'win.2.t': 'Gerçek medya bilgisi',
  'win.2.d': 'Windows medya oturumlarından şarkı adı, kapak ve süre gelir.',
  'win.3.t': 'Gerçek sürükle-bırak',
  'win.3.d': 'Gezginden bırakılan dosya rafta durur; çift tıkla açılır.',
  'win.4.t': 'Sistem işaretleri',
  'win.4.d': 'Ses, Caps Lock ve klavye dili kapalı adada kısa bir işaret olarak görünür.',

  'cta.title': 'Ajanların seni beklemesin.',
  'cta.lead': 'AgentOffice Windows 10 ve 11 için hazırlanıyor.',
  'cta.button': 'Windows için indir',
  'cta.note': 'İndirme bağlantısı yakında burada.',

  'foot.indie': 'AgentOffice bağımsız bir projedir; Anthropic ya da OpenAI ile bağlantılı değildir, onlar tarafından onaylanmamıştır. Claude ve Codex adları yalnız hangi araçlarla çalıştığını anlatmak için geçer.',
  'foot.demo': 'Bu sayfadaki ajanlar, projeler, notlar, şarkılar ve dosyalar uydurmadır. Canlı adalar uygulamanın kendi arayüz kodudur; hiçbir yere bir şey göndermez.',
  'foot.font': 'Yazı tipi: Manrope (SIL Open Font License 1.1).',

  'toast.settings': 'Ayarlar masaüstü uygulamasında açılır.',
  'toast.source': 'Masaüstü uygulamasında bu düğme sohbeti kendi penceresinde açar.',
  'toast.pick': 'Dosya seçme penceresi masaüstünde açılır; burada örnek dosyaları sürükle.',
  'island.frame': 'Canlı AgentOffice adası: {page}',
  'page.agents': 'Ajanlar', 'page.media': 'Medya', 'page.notes': 'Notlar', 'page.focus': 'Odak', 'page.alarms': 'Alarmlar', 'page.water': 'Su takibi', 'page.shelf': 'Dosya rafı',
  'scaled': 'Küçültülmüş gösterim',
} as const;

export type Key = keyof typeof tr;
/** English: to be filled in; missing keys fall back to Turkish. */
export const en: Partial<Record<Key, string>> = {};

const catalogs: Record<string, Partial<Record<Key, string>>> = { tr, en };
export const lang = (() => { const q = new URLSearchParams(location.search).get('lang'); return q && q in catalogs ? q : 'tr'; })();
export function t(key: Key, vars: Record<string, string> = {}): string {
  const text = catalogs[lang][key] ?? tr[key] ?? key;
  return text.replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? `{${k}}`);
}
/** Fills every [data-i18n] (inner HTML, the catalog's own markup) and [data-i18n-attr="attr:key;…"]. */
export function applyStrings(root: ParentNode = document) {
  root.querySelectorAll<HTMLElement>('[data-i18n]').forEach(el => { el.innerHTML = t(el.dataset.i18n as Key); });
  root.querySelectorAll<HTMLElement>('[data-i18n-attr]').forEach(el => el.dataset.i18nAttr!.split(';').forEach(pair => { const [attr, key] = pair.split(':'); if (attr && key) el.setAttribute(attr.trim(), t(key.trim() as Key)); }));
  document.documentElement.lang = lang;
}
