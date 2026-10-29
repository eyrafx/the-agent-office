/** Only the website's fictional question is translated; real/user content is never rewritten. */
export const sampleQuestionCopy:Record<string,readonly string[]>={
 en:['Which homepage should we use?','Choose an interactive product demo or a product screenshot.','Homepage','Interactive product demo','Let visitors try the island and office.','Product screenshot','Show one product view.','Preparing the interactive homepage'],
 tr:['Hangi ana sayfayı kullanalım?','Etkileşimli ürün demosunu veya ürün ekran görüntüsünü seç.','Ana sayfa','Etkileşimli ürün demosu','Ziyaretçiler adayı ve ofisi deneyebilsin.','Ürün ekran görüntüsü','Ürünün bir görünümünü göster.','Etkileşimli ana sayfayı hazırlıyor'],
 es:['¿Qué página de inicio usamos?','Elige una demo interactiva o una captura del producto.','Página de inicio','Demo interactiva del producto','Deja que los visitantes prueben la isla y la oficina.','Captura del producto','Muestra una vista del producto.','Preparando la página de inicio interactiva'],
 de:['Welche Startseite sollen wir verwenden?','Wähle eine interaktive Produktdemo oder einen Screenshot.','Startseite','Interaktive Produktdemo','Besucher können die Insel und das Büro ausprobieren.','Produkt-Screenshot','Eine Ansicht des Produkts zeigen.','Bereitet die interaktive Startseite vor'],
 fr:['Quelle page d’accueil utiliser ?','Choisis une démo interactive ou une capture du produit.','Accueil','Démo interactive du produit','Permets aux visiteurs d’essayer l’îlot et le bureau.','Capture du produit','Montre une vue du produit.','Prépare la page d’accueil interactive'],
 'pt-BR':['Qual página inicial devemos usar?','Escolha uma demo interativa ou uma captura do produto.','Página inicial','Demo interativa do produto','Deixe os visitantes experimentarem a ilha e o escritório.','Captura do produto','Mostre uma visão do produto.','Preparando a página inicial interativa'],
 it:['Quale pagina iniziale usiamo?','Scegli una demo interattiva o uno screenshot del prodotto.','Pagina iniziale','Demo interattiva del prodotto','Permetti ai visitatori di provare l’isola e l’ufficio.','Screenshot del prodotto','Mostra una vista del prodotto.','Prepara la pagina iniziale interattiva'],
 ru:['Какую главную страницу использовать?','Выбери интерактивную демоверсию или снимок продукта.','Главная страница','Интерактивная демоверсия','Пусть посетители попробуют остров и офис.','Снимок продукта','Показать один вид продукта.','Готовит интерактивную главную страницу'],
 ja:['どのホームページを使いますか？','インタラクティブな製品デモか製品の画像を選んでください。','ホームページ','インタラクティブな製品デモ','訪問者がアイランドとオフィスを試せます。','製品のスクリーンショット','製品の画面を1つ表示します。','インタラクティブなホームページを準備中'],
 ko:['어떤 홈페이지를 사용할까요?','대화형 제품 데모 또는 제품 스크린샷을 선택하세요.','홈페이지','대화형 제품 데모','방문자가 아일랜드와 오피스를 체험할 수 있어요.','제품 스크린샷','제품 화면 하나를 보여 줍니다.','대화형 홈페이지를 준비 중'],
 'zh-Hans':['我们应该使用哪种主页？','请选择交互式产品演示或产品截图。','主页','交互式产品演示','让访客体验岛和办公室。','产品截图','展示一个产品视图。','正在准备交互式主页']
};
export function localizeSampleQuestion<T extends {sessions:any[];requests:any[]}>(snapshot:T,language:string):T{
 const result=structuredClone(snapshot),c=sampleQuestionCopy[language]||sampleQuestionCopy.en;
 if((result as any).mode==='demo'){const now=Date.now();(result as any).limits=[{provider:'claude',plan:'Pro',updatedAt:now,source:'Demo',windows:[{windowMinutes:300,usedPercent:38,resetsAt:now+7200000},{windowMinutes:10080,usedPercent:24,resetsAt:now+259200000}]},{provider:'codex',plan:'Plus',updatedAt:now,source:'Demo',windows:[{windowMinutes:300,usedPercent:62,resetsAt:now+10800000},{windowMinutes:10080,usedPercent:31,resetsAt:now+345600000}]}];}
 const design=result.sessions.find(s=>s.key.sessionId==='sample-design');
 if(design)design.summary=design.status==='waiting'?c[0]:c[7];
 localizeTeam(result,language);
 result.requests=result.requests.map(r=>{
  if(r.key?.requestId!=='sample-question'||r.key?.sessionKey?.sessionId!=='sample-design')return r;
  return {...r,title:c[0],detail:c[1],options:[c[3],c[5]],questions:[{...r.questions?.[0],header:c[2],question:c[0],options:[{label:c[3],description:c[4]},{label:c[5],description:c[6]}],multiSelect:false}]};
 });
 return result;
}

/** The fictional team's names and what they are doing, per language (sample content only):
 *  six names (lead, design, development, testing, writing, research), four activities, then the
 *  manager's four coordinating lines, all in the order of `teamSource`. */
export const teamSource=['Project lead','Design','Development','Testing','Writing','Research','Building the interface','Checking layouts and interactions','Copy is ready for review','Research complete','Coordinating the website launch','Asking Design to pick the homepage','Reviewing what Development has built','Lining up the tests for launch'] as const;
export const teamCopy:Record<string,readonly string[]>={
 en:teamSource,
 tr:['Proje lideri','Tasarım','Geliştirme','Test','Metin','Araştırma','Arayüzü kuruyor','Yerleşimi ve etkileşimleri deniyor','Metinler incelemeye hazır','Araştırma tamamlandı','Site lansmanını yönetiyor','Tasarım’dan ana sayfa seçimini istiyor','Geliştirme’nin yaptıklarını inceliyor','Lansman testlerini sıraya koyuyor'],
 es:['Líder del proyecto','Diseño','Desarrollo','Pruebas','Redacción','Investigación','Construyendo la interfaz','Revisando diseño e interacciones','Textos listos para revisar','Investigación completada','Coordinando el lanzamiento del sitio','Pidiendo a Diseño que elija la página de inicio','Revisando lo que construyó Desarrollo','Preparando las pruebas del lanzamiento'],
 de:['Projektleitung','Design','Entwicklung','Tests','Texte','Recherche','Baut die Oberfläche','Prüft Layouts und Interaktionen','Texte sind bereit zur Durchsicht','Recherche abgeschlossen','Koordiniert den Website-Start','Bittet Design, die Startseite zu wählen','Prüft, was die Entwicklung gebaut hat','Plant die Tests für den Start'],
 fr:['Chef de projet','Design','Développement','Tests','Rédaction','Recherche','Construit l’interface','Vérifie mises en page et interactions','Textes prêts à relire','Recherche terminée','Coordonne le lancement du site','Demande au Design de choisir l’accueil','Relit ce que le Développement a construit','Prépare les tests du lancement'],
 'pt-BR':['Líder do projeto','Design','Desenvolvimento','Testes','Redação','Pesquisa','Construindo a interface','Verificando layouts e interações','Textos prontos para revisão','Pesquisa concluída','Coordenando o lançamento do site','Pedindo ao Design que escolha a página inicial','Revisando o que o Desenvolvimento construiu','Organizando os testes do lançamento'],
 it:['Capo progetto','Design','Sviluppo','Test','Testi','Ricerca','Sta costruendo l’interfaccia','Controlla layout e interazioni','Testi pronti per la revisione','Ricerca completata','Coordina il lancio del sito','Chiede al Design di scegliere la home','Rivede ciò che lo Sviluppo ha costruito','Prepara i test per il lancio'],
 ru:['Руководитель','Дизайн','Разработка','Тесты','Тексты','Исследование','Собирает интерфейс','Проверяет вёрстку и взаимодействия','Тексты готовы к проверке','Исследование завершено','Координирует запуск сайта','Просит Дизайн выбрать главную','Проверяет, что сделала Разработка','Готовит тесты к запуску'],
 ja:['プロジェクトリード','デザイン','開発','テスト','ライティング','リサーチ','インターフェースを構築中','レイアウトと操作を確認中','文章のレビュー準備完了','リサーチ完了','サイト公開を取りまとめ中','デザインにホームページの選択を依頼中','開発の成果を確認中','公開前テストを段取り中'],
 ko:['프로젝트 리드','디자인','개발','테스트','글쓰기','리서치','인터페이스를 만드는 중','레이아웃과 상호작용 확인 중','문구 검토 준비 완료','리서치 완료','웹사이트 출시를 조율하는 중','디자인에 홈페이지 선택을 요청하는 중','개발이 만든 결과를 검토하는 중','출시 테스트를 준비하는 중'],
 'zh-Hans':['项目负责人','设计','开发','测试','文案','调研','正在搭建界面','正在检查布局和交互','文案已可审阅','调研完成','正在协调网站上线','请设计选择主页','正在审查开发的成果','正在安排上线测试']
};
const TEAM_IDS=['sample-manager','sample-design','sample-code','sample-test','sample-copy','sample-research'];
/** The team's names and activities in the chosen language (a known English line → its translation). */
export function localizeTeam<T extends {sessions:any[]}>(snapshot:T,language:string):T{
 const c=teamCopy[language]||teamCopy.en;
 for(const s of snapshot.sessions){
  const i=TEAM_IDS.indexOf(s.key?.sessionId);if(i<0)continue;
  s.name=c[i];
  // The activity may already be in another language (a snapshot passed between frames).
  const at=Object.values(teamCopy).map(v=>v.indexOf(s.summary)).find(x=>x>=6);
  if(at!==undefined)s.summary=c[at];
 }
 return snapshot;
}
