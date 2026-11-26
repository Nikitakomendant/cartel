'use strict';
/**
 * Initial content for an empty database: real data from the current cartel.ua
 * (venues, phones, menus, quotes, history) in Ukrainian and English.
 * Photos in /seed-assets are temporary — CARTEL replaces them with its
 * professional library through the CMS.
 */
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const config = require('./config');
const { db, now, entries, setSetting, getSetting } = require('./db');
const schema = require('./schema');
const sec = require('./security');

const T = (uk, en) => ({ uk, en });
const ASSETS = path.join(config.ROOT, 'seed-assets');
const rid = () => crypto.randomBytes(4).toString('hex');
const block = (type, data, hidden = false) => ({ id: rid(), type, hidden, data });

const GENERAL_PHONE = '+38 (067) 344-10-99';
const BUKOVEL = T('ТК «Буковель»', 'Bukovel resort');
const city = T('Буковель', 'Bukovel');

async function seedContent() {
  const create = entries.create.bind(entries);
  const entriesN = { create: (type, o) => create(type, { ...o, data: schema.normalizeEntry(type, o.data) }) };

  // Photos are attached afterwards from seed-assets/photos.json (see src/photos.js)
  const im = {};

  // ---------------- brands ----------------
  // Coordinates are approximate (within the Bukovel resort) — marketing sets exact points in the CMS map picker.
  const base = { show_gallery: true, show_info: true, show_map: true, show_contacts: true, show_social: true, show_in_contacts: true, links: [], info: [], gallery: [], phones: [GENERAL_PHONE], blocks: [] };
  const R = (o) => ({ ...base, category: 'restaurant', city, address: BUKOVEL, ...o });
  const brands = [
    ['teppan', R({
      name: T('TEPPAN grill & sushi', 'TEPPAN grill & sushi'), hero: im['teppan-hero'], card: im.teppan,
      tagline: T('Азійська кухня та єдине в країні шоу на тепаньякі-грилі.', 'Asian cuisine and the only teppanyaki grill show in the country.'),
      description: T('<p>Ресторан азійської кухні, заради якого наші кухарі відвідали найкращі локації Південно-Східної Азії — від Сайгону до Сінгапуру.</p><p>Єдине в країні шоу на тепаньякі-грилі, wok-страви, суші-станція та багато іншого для захоплення культурою Сходу з видом на Карпатські гори.</p>',
        '<p>An Asian restaurant for which our chefs travelled to the best spots of South-East Asia — from Saigon to Singapore.</p><p>The only teppanyaki grill show in the country, wok dishes, a sushi station and much more — with a view of the Carpathian mountains.</p>'),
      info: [{ label: T('Кухня', 'Cuisine'), value: T('Азійська, теппаньякі, суші', 'Asian, teppanyaki, sushi') }],
      hours: T('11:00–23:00', '11:00–23:00'), phones: ['+38 097 350 11 22'],
      menu_url: 'https://expz.menu/d574f10e-a3f3-481d-85de-fe6f8fdae925',
      facebook: 'https://www.facebook.com/profile.php?id=61571261223163', instagram: 'https://www.instagram.com/teppan.grill.sushi.bukovel/',
      geo: { lat: 48.3601, lng: 24.4063 },
    })],
    ['le-grand', R({
      name: T('LE GRAND RESTAURANT', 'LE GRAND RESTAURANT'), hero: im['le-grand'],
      tagline: T('Європейська кухня й діаманти карпатської гастрономії в лобі Mountain Residence.', 'European cuisine and Carpathian classics in the lobby of Mountain Residence.'),
      description: T('<p>Особливе місце, розташоване в лобі готелю Mountain Residence Hotel Wellness &amp; Spa, з неймовірними краєвидами та атмосферою.</p><p>Шеф-кухарі ресторану Le Grand надихалися своєю справою у французьких Альпах, серед найкращих гірськолижних курортів, тому відповідально й зважено додали до меню найсмачніші страви європейської кухні. Вони також не забули про діаманти карпатської гастрономії, дбайливо зібрані серед вершин Чорногірського хребта й виділені в окрему сторінку меню.</p><p>Власна винна кімната з приголомшливою винною картою стане найкращим доповненням до вечері з видом на величні Горгани.</p>',
        '<p>A special place in the lobby of Mountain Residence Hotel Wellness &amp; Spa, with breathtaking views and atmosphere.</p><p>Our chefs found their inspiration in the French Alps, among the best ski resorts, and carefully brought the finest European dishes to the menu — together with gems of Carpathian gastronomy gathered among the peaks of the Chornohora ridge, presented on a separate page of the menu.</p><p>A private wine room with an outstanding wine list completes a dinner with a view of the Gorgany mountains.</p>'),
      info: [{ label: T('Кухня', 'Cuisine'), value: T('Європейська, карпатська', 'European, Carpathian') }, { label: T('Особливість', 'Highlight'), value: T('Власна винна кімната', 'Private wine room') }],
      hours: T('11:00–23:00', '11:00–23:00'), phones: ['+38 097 350 11 22'], address: T('Лобі Mountain Residence Hotel, ТК «Буковель»', 'Mountain Residence Hotel lobby, Bukovel'),
      menu_url: 'https://expz.menu/5719297a-66bf-43eb-b980-4b368da5bd6b',
      facebook: 'https://www.facebook.com/profile.php?id=61571297911197', instagram: 'https://www.instagram.com/legrand.restaurant.bukovel/',
      geo: { lat: 48.3572, lng: 24.4125 },
    })],
    ['veranda', R({
      name: T('VERANDA Karaoke & Lounge', 'VERANDA Karaoke & Lounge'), hero: im.veranda,
      tagline: T('Лаунж у стилі скляної архітектури, авторські коктейлі та караоке.', 'A glass-architecture lounge with signature cocktails and karaoke.'),
      description: T('<p>Сучасний дизайн з елементами стилю лофт, ретельно підібрана музика в стилі techno house від провідних європейських саунд-продюсерів та гра світла утворюють незабутню атмосферу у Veranda Bar &amp; Lounge.</p><p>У лаунж-зоні — унікальна колекція авторських коктейлів та світова класика, палітра популярних десертів з різних куточків світу, кальяни та кавові напої для найвибагливіших кавоманів.</p>',
        '<p>Contemporary loft-style design, techno-house music curated by leading European sound producers and a play of light create the unforgettable atmosphere of Veranda Bar &amp; Lounge.</p><p>Expect a unique collection of signature cocktails and world classics, desserts from around the world, hookahs and coffee for the most demanding connoisseurs.</p>'),
      info: [{ label: T('Формат', 'Format'), value: T('Лаунж, караоке, коктейль-бар', 'Lounge, karaoke, cocktail bar') }],
      hours: T('11:00–23:00, караоке 18:00–23:00', '11:00–23:00, karaoke 18:00–23:00'), phones: ['+38 067 350 66 00'],
      address: T('урочище Щивки, 3, с. Поляниця', 'Shchyvky 3, Polianytsia'),
      menu_url: 'https://veranda-cartel.choiceqr.com/',
      facebook: 'https://www.facebook.com/VerandaBukovel/', instagram: 'https://www.instagram.com/veranda_karaoke_lounge/',
      geo: { lat: 48.3624, lng: 24.4021 },
    })],
    ['yeti', R({
      name: T('Yeti Après-Ski Terrace', 'Yeti Après-Ski Terrace'), hero: im.yeti,
      tagline: T('Французькі après-ski вечірки біля нижньої станції витягу 2Б.', 'French-style après-ski parties by the lower station of lift 2B.'),
      description: T('<p>Yeti Après Ski Terrace — центр французьких зимових вечірок і зимового драйву. Тераса розташована між нижньою станцією витягу 2Б та схилом.</p><p>Діджеї з Куршевеля та топових курортів Франції заряджають атмосферу своєю енергією та музикою.</p>',
        '<p>Yeti Après Ski Terrace is the home of French-style winter parties. The terrace sits between the lower station of lift 2B and the slope.</p><p>DJs from Courchevel and other top French resorts set the mood.</p>'),
      info: [{ label: T('Сезон', 'Season'), value: T('Зима', 'Winter') }],
      hours: T('16:00–20:00', '16:00–20:00'), phones: ['+38 097 350 11 22'],
      menu_url: 'https://expz.menu/9bc411d4-f6de-4d7e-a0ec-3946ae381b71',
      facebook: 'https://www.facebook.com/yeti.apres.ski.bukovel', instagram: 'https://www.instagram.com/yeti.apres.ski.bukovel/',
      geo: { lat: 48.3653, lng: 24.4108 },
    })],
    ['asia-garden', R({
      name: T('Asia Garden', 'Asia Garden'), hero: im['asia-garden'], notice: T('Тимчасово зачинено', 'Temporarily closed'),
      tagline: T('Смаки всієї Азії під електронну музику в антуражі тропічного лісу.', 'Flavours of all of Asia to electronic music in a tropical-forest setting.'),
      description: T('<p>Asia Garden поєднує азійську кухню та сучасний електронний ритм. Рослини, мʼяке освітлення та арт-інсталяції створюють атмосферу тропічного лісу.</p><p>У меню — подорож Азією: японські суші та сашимі, тайські каррі, традиційні китайські страви та інші шедеври азійської кухні.</p>',
        '<p>Asia Garden brings together Asian cuisine and contemporary electronic rhythm. Plants, soft lighting and art installations create the feel of a tropical forest.</p><p>The menu is a journey across Asia: Japanese sushi and sashimi, Thai curries, traditional Chinese dishes and more.</p>'),
      phones: ['+38 067 350 44 11'], menu_url: 'https://asiagarden-cartel.choiceqr.com/',
      facebook: 'https://www.facebook.com/asiagardenbuka', instagram: 'https://www.instagram.com/asia.garden.bukovel',
      geo: { lat: 48.3611, lng: 24.4079 },
    })],
    ['jagermeister-apres-ski-zone', R({ name: T('Jägermeister Après Ski Zone', 'Jägermeister Après Ski Zone'), hero: im.jagermeister, tagline: T('Après-ski локація біля верхньої станції витягу 2R.', 'Après-ski spot at the upper station of lift 2R.'), description: T('<p>Нова локація в Буковелі «Après Ski Zone» на території верхньої станції витягу 2R.</p>', '<p>A new après-ski location in Bukovel at the upper station of lift 2R.</p>'), geo: { lat: 48.3536, lng: 24.4209 } })],
    ['living-room', R({ name: T('Living Room', 'Living Room'), hero: im['living-room'], tagline: T('Панорамний ресторан у самому серці Буковелю.', 'A panoramic restaurant in the heart of Bukovel.'), description: T('<p>Панорамний ресторан у самому серці Буковелю.</p>', '<p>A panoramic restaurant in the very heart of Bukovel.</p>'), geo: { lat: 48.3589, lng: 24.4101 } })],
    ['girafa', R({ name: T('GIRAFA restaurant & lounge', 'GIRAFA restaurant & lounge'), hero: im.girafa, tagline: T('Ресторан середземноморської кухні.', 'Mediterranean restaurant and lounge.'), description: T('<p>Ресторан середземноморської кухні.</p>', '<p>A Mediterranean restaurant and lounge.</p>'), geo: { lat: 48.3617, lng: 24.4045 } })],
    ['kolyba', R({ name: T('Колиба', 'Kolyba'), hero: im.kolyba, tagline: T('Домашні вареники, гуцульський борщ, голубці з мʼясом.', 'Homemade varenyky, Hutsul borscht and cabbage rolls.'), description: T('<p>Домашні вареники, гуцульський борщ, голубці з мʼясом.</p>', '<p>Homemade varenyky, Hutsul borscht, cabbage rolls with meat.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Гуцульська', 'Hutsul') }], geo: { lat: 48.3595, lng: 24.4032 } })],
    ['osteria-italiana', R({ name: T('Osteria Italiana', 'Osteria Italiana'), hero: im.osteria, tagline: T('Паста власного виробництва, мʼясо, риба та вишукані десерти.', 'Handmade pasta, meat, fish and fine desserts.'), description: T('<p>Власноруч виготовлена паста, традиційні мʼясні страви та риба, вишукані десерти.</p>', '<p>Handmade pasta, traditional meat and fish dishes, fine desserts.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Італійська', 'Italian') }], geo: { lat: 48.3631, lng: 24.4086 } })],
    ['plov', R({ name: T('PLOV', 'PLOV'), hero: im.plov, tagline: T('Плов, чебуреки, кебаб, лагман, шурпа, янтик.', 'Plov, chebureki, kebab, lagman, shurpa, yantyk.'), description: T('<p>Плов, чебуреки, кебаб, лагман, шурпа, янтик.</p>', '<p>Plov, chebureki, kebab, lagman, shurpa and yantyk.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Східна', 'Oriental') }], geo: { lat: 48.3608, lng: 24.4014 } })],
    ['rebra-bbq', R({ name: T("REBRA BBQ beer'n'grill", "REBRA BBQ beer'n'grill"), hero: im['rebra-bbq'], tagline: T('Демократичний мʼясний BBQ у форматі casual food.', 'Casual meat BBQ and beer.'), description: T('<p>Демократичний мʼясний BBQ ресторан у форматі casual food.</p>', '<p>A casual-food BBQ restaurant for meat lovers.</p>'), geo: { lat: 48.3584, lng: 24.4058 } })],
    ['riba-grill', R({ name: T('Риба Grill', 'Ryba Grill'), hero: im['riba-grill'], tagline: T('Рибний ресторан з відкритим грилем біля озера.', 'Fish restaurant with an open grill by the lake.'), description: T('<p>Демократичний рибний ресторан з відкритим грилем біля озера.</p>', '<p>A relaxed fish restaurant with an open grill by the lake.</p>'), geo: { lat: 48.3569, lng: 24.4039 } })],
    ['panorama-lounge', R({ name: T('Panorama Lounge', 'Panorama Lounge'), hero: im['panorama-lounge'], tagline: T('Сендвічі та світові десерти з краєвидом на Горгани.', 'Sandwiches and desserts with a view of the Gorgany.'), description: T('<p>Пориньте у світ смаку з асортиментом сендвічів та світових десертів, насолоджуючись краєвидом на Горгани.</p>', '<p>Sandwiches and desserts from around the world with a view of the Gorgany mountains.</p>'), geo: { lat: 48.3547, lng: 24.4176 } })],
    ['filvarok', R({ name: T('Filvarok', 'Filvarok'), hero: im.filvarok, tagline: T('Українська кухня, страви на вогні. Пʼять закладів на курорті.', 'Ukrainian cuisine cooked over fire. Five venues at the resort.'), description: T('<p>Українська кухня, страви на вогні. Мережа з пʼяти закладів у Буковелі.</p>', '<p>Ukrainian cuisine cooked over open fire. A family of five venues in Bukovel.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Українська', 'Ukrainian') }, { label: T('Закладів', 'Venues'), value: T('5', '5') }], geo: { lat: 48.3628, lng: 24.4117 } })],
    ['salo', R({ name: T('SALO', 'SALO'), hero: im.salo, tagline: T('5 видів сала, 32 види горілки, страви з дичини.', '5 kinds of salo, 32 vodkas and game dishes.'), description: T('<p>5 видів сала, 32 види горілки, страви з дичини.</p>', '<p>Five kinds of salo, 32 kinds of vodka and game dishes.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Українська', 'Ukrainian') }], geo: { lat: 48.3598, lng: 24.4091 } })],
    ['mangalica', R({ name: T('MANGALICA', 'MANGALICA'), hero: im.mangalica, tagline: T('Бограч, деруни з мʼясом дикого кабана, гомбовці.', 'Bograch, wild-boar potato pancakes, gombovtsi.'), description: T('<p>Бограч, деруни з мʼясом дикого кабана, гомбовці.</p>', '<p>Bograch, potato pancakes with wild boar, gombovtsi dumplings.</p>'), info: [{ label: T('Кухня', 'Cuisine'), value: T('Карпатська', 'Carpathian') }], geo: { lat: 48.3615, lng: 24.4003 } })],
    ['eat-n-go', R({ name: T("Eat'n'Go!", "Eat'n'Go!"), tagline: T('Мережа кафе швидкого харчування на схилах Буковелю.', 'Quick-service cafés on the slopes of Bukovel.'), description: T('<p>Швидко та смачно — улюблені пункти та кафе швидкого харчування на схилах Буковелю. Ситні страви швидко та доступно.</p>', '<p>Fast and tasty — favourite quick-service points and cafés on the slopes of Bukovel. Hearty food, fast and affordable.</p>'), address: T('Схили ТК «Буковель»', 'Bukovel slopes') })],
    ['buka-apart-hotel', {
      ...base, category: 'hotel', city, name: T('BUKA Apart-Hotel', 'BUKA Apart-Hotel'), hero: im['buka-apart-hotel'],
      tagline: T('Апартготель у центрі курорту з панорамою всього Буковелю.', 'An apart-hotel in the centre of the resort with a panorama of all Bukovel.'),
      description: T('<p>Апартготель у центральній локації з панорамою всього курорту Буковель. Номери в самому серці інфраструктури — поруч ресторани, підйомники та розважальні локації CARTEL.</p>',
        '<p>An apart-hotel in a central location with a panoramic view of the whole Bukovel resort. Rooms in the heart of the resort — next to restaurants, lifts and CARTEL entertainment venues.</p>'),
      info: [{ label: T('Розташування', 'Location'), value: T('Центр курорту', 'Resort centre') }, { label: T('Поруч', 'Nearby'), value: T('Підйомники, ресторани CARTEL', 'Ski lifts, CARTEL restaurants') }],
      address: BUKOVEL, reception_phone: GENERAL_PHONE, phones: [], booking_url: 'tel:+380673441099',
      geo: { lat: 48.3606, lng: 24.4097 },
    }],
    ['mountain-residence', {
      ...base, category: 'hotel', city, name: T('Mountain Residence', 'Mountain Residence'), hero: im['mountain-residence'],
      tagline: T('Апартаменти та шале на трасі 2С з краєвидом на Карпати.', 'Apartments and chalets on slope 2C with Carpathian views.'),
      description: T('<p>Готель розташований у красивій та зручній локації — на трасі 2С, неподалік від усіх головних локацій «Буковелю». Просторі апартаменти для родинного відпочинку з краєвидом на Карпати.</p><p>У лобі готелю працює LE GRAND RESTAURANT.</p>',
        '<p>The hotel enjoys a beautiful and convenient location on slope 2C, close to all the main spots of Bukovel. Spacious apartments for family holidays with views of the Carpathians.</p><p>LE GRAND RESTAURANT is located in the hotel lobby.</p>'),
      info: [{ label: T('Розташування', 'Location'), value: T('Траса 2С', 'Slope 2C') }, { label: T('Формат', 'Format'), value: T('Апартаменти, шале', 'Apartments, chalets') }],
      address: T('Траса 2С, ТК «Буковель»', 'Slope 2C, Bukovel'), reception_phone: GENERAL_PHONE, phones: [], booking_url: 'tel:+380673441099',
      geo: { lat: 48.3570, lng: 24.4131 },
    }],
    ['voda-club', {
      ...base, category: 'spa', city, name: T('VODA club', 'VODA club'),
      tagline: T('Найвисокогірніший пляж країни: всесезонний басейн, SPA та джакузі.', 'The highest beach in the country: all-season pool, SPA and jacuzzi.'),
      description: T('<p>Найвисокогірніший пляж країни у самому серці Карпат. Всесезонний басейн, SPA, джакузі та ресторан зроблять ваш відпочинок незабутнім.</p><p>SPA-комплекс VODA club працює з 2015 року на березі озера Молодості — влітку тут засмагають і відпочивають біля води, взимку після катання приходять на SPA-процедури.</p>',
        '<p>The highest-altitude beach in the country, in the heart of the Carpathians. An all-season pool, SPA, jacuzzi and a restaurant make every visit memorable.</p><p>VODA club has been open since 2015 on the shore of Lake Molodosti — sunbathing in summer, SPA treatments after skiing in winter.</p>'),
      info: [{ label: T('Сезон', 'Season'), value: T('Цілий рік', 'All year') }, { label: T('Локація', 'Location'), value: T('Озеро Молодості', 'Lake Molodosti') }],
      address: T('Озеро Молодості, ТК «Буковель»', 'Lake Molodosti, Bukovel'),
      geo: { lat: 48.3579, lng: 24.4047 },
    }],
    ['banka-na-drovah', {
      ...base, category: 'spa', city, name: T('Банька на дровах', 'Banka na Drovakh'),
      tagline: T('Старовинний банний обряд і професійний масаж у тихому куточку Буковелю.', 'A traditional bathhouse ritual and massage in a quiet corner of Bukovel.'),
      description: T('<p>«Банька на дровах» розташована у тихому куточку в центрі Буковелю. Насолодіться старовинним банним обрядом та професійним масажем.</p><p>Тут усе дихає традиціями наших предків: баня на озері — джерело енергії для любителів здорового відпочинку.</p>',
        '<p>“Banka na Drovakh” — a wood-fired bathhouse in a quiet corner of central Bukovel. Enjoy a traditional bathing ritual and a professional massage.</p><p>Everything here breathes the traditions of our ancestors: a bathhouse on the lake is a source of energy for lovers of healthy rest.</p>'),
      geo: { lat: 48.3563, lng: 24.4028 },
    }],
  ];
  const brandIds = {};
  for (const [slug, data] of brands) brandIds[slug] = entriesN.create('brand', { slug, data, publish: true });

  // ---------------- projects ----------------
  const mrId = entriesN.create('project', {
    slug: 'mountain-residence-villas', publish: true, data: {
      title: T('Mountain Residence', 'Mountain Residence'), subtitle: T('Premium Villas & SPA', 'Premium Villas & SPA'),
      location: T('Буковель, Карпати', 'Bukovel, Carpathians'),
      short: T('Новий інвестиційний проєкт CARTEL — преміальні вілли з власним SPA у Карпатах. Повна презентація, планування та умови — на офіційному сайті проєкту.',
        'CARTEL’s new investment project — premium villas with a private SPA in the Carpathians. Full presentation, layouts and terms are on the official project website.'),
      image: im['mountain-residence'], external_url: '', button_label: T('Перейти на сайт проєкту', 'Visit project website'), has_page: false, blocks: [],
    },
  });

  // ---------------- quotes (as published on cartel.ua) ----------------
  const quotes = [
    { text: T('Часто буваю на Буковелі, мені тут дуже подобається. Головне те, що ви йдете в ногу з часом, тому сервіс з року в рік залишається на високому рівні. Дуже люблю борщ у «Фільварку» і взагалі страви гуцульської кухні. Дякую вам за затишок.',
      'I come to Bukovel often and I really like it here. What matters is that you keep up with the times, so the service stays at a high level year after year. I love the borscht at Filvarok and Hutsul cuisine in general. Thank you for the cosiness.'),
    author: T('Олег Михайлюта (Фагот)', 'Oleh Mykhailiuta (Fagot)'), role: T('соліст гурту «ТНМК»', 'vocalist of TNMK') },
    { text: T('На західну Україну тепер можна їздити не лише заради гір і не лише взимку: ще один привід — розважальний комплекс VODA у Буковелі, де можна плавати в басейні, засмагати біля озера, а взимку після катання приймати SPA-процедури.',
      'Western Ukraine is now worth visiting not only for the mountains and not only in winter: another reason is the VODA complex in Bukovel, where you can swim in the pool, sunbathe by the lake and, in winter, enjoy SPA treatments after skiing.'),
    author: T('Тетяна Гриньова', 'Tetiana Hrynova'), role: T('головна редакторка й керівниця bit.ua', 'editor-in-chief and head of bit.ua') },
    { text: T('Сидиш на сонячній заскленій терасі Veranda, їси тапаси та бургери і забуваєш, де ти — в Андоррі, Аспені чи Курмайорі. Але в глибині душі відчуваєш і радієш — вдома!',
      'You sit on the sunny glass terrace of Veranda, eating tapas and burgers, and forget where you are — Andorra, Aspen or Courmayeur. But deep down you feel it and you are glad — you are home!'),
    author: T('Валерій Поляков', 'Valerii Poliakov'), role: T('ресторатор, засновник «Клубу рестораторів», ресторанний критик Forbes', 'restaurateur, founder of the Restaurateurs Club, Forbes restaurant critic') },
  ];
  for (const q of quotes) entriesN.create('quote', { data: q, publish: true });

  // ---------------- Signature events (drafts: marketing adds photos and publishes) ----------------
  entriesN.create('event', { status: 'draft', data: { title: T('Виступ Тіни Кароль', 'Tina Karol live'), date: T('', ''), caption: T('Додайте фото, дату та короткий підпис, потім натисніть «Опублікувати».', 'Add photos, a date and a short caption, then publish.'), photos: [], cover: null, video: null, embed: '' } });
  entriesN.create('event', { status: 'draft', data: { title: T('Концерт svet', 'svet concert'), date: T('', ''), caption: T('Додайте фото, дату та короткий підпис, потім натисніть «Опублікувати».', 'Add photos, a date and a short caption, then publish.'), photos: [], cover: null, video: null, embed: '' } });

  // ---------------- example vacancy (draft — HR edits and publishes real ones) ----------------
  entriesN.create('vacancy', {
    slug: 'oficiant', status: 'draft', data: {
      title: T('Офіціант / офіціантка', 'Waiter / waitress'), location: T('Буковель', 'Bukovel'), brand: brandIds.teppan,
      employment: T('Повна зайнятість, сезон', 'Full-time, seasonal'), salary: T('', ''),
      summary: T('Шаблон вакансії — замініть текст і опублікуйте.', 'Vacancy template — replace the text and publish.'),
      duties: T('<ul><li>Обслуговування гостей залу</li><li>Консультації щодо меню</li></ul>', '<ul><li>Serving guests</li><li>Advising on the menu</li></ul>'),
      requirements: T('<ul><li>Досвід роботи від 6 місяців</li></ul>', '<ul><li>At least 6 months of experience</li></ul>'),
      conditions: T('<ul><li>Офіційне працевлаштування</li></ul>', '<ul><li>Official employment</li></ul>'),
    },
  });

  // ---------------- pages ----------------
  const page = (slug, title, blocks, seo = {}) => entriesN.create('page', { slug, system: 1, publish: true, data: { title, seo_title: T('', ''), seo_description: T('', ''), seo_image: null, noindex: false, ...seo, blocks } });

  page('home', T('Головна', 'Home'), [
    block('hero', { title: T('Новий рівень відпочинку в Україні', 'A new standard of hospitality in Ukraine'), subtitle: T('Ресторани, готелі та SPA у Буковелі, Яремче та Одесі — з 2004 року.', 'Restaurants, hotels and SPA in Bukovel, Yaremche and Odesa — since 2004.'), image: im['buka-apart-hotel'], video: null, size: 'full', button_label: T('Наші бренди', 'Our brands'), button_url: '/brands', button2_label: T('Про компанію', 'About us'), button2_url: '/about' }),
    block('text_image', { title: T('Про CARTEL', 'About CARTEL'), body: T('<p>У 2004 році ми почали реалізовувати перші гастрономічні проєкти у «Буковелі». Сьогодні CARTEL — це холдинг, який обʼєднує ресторани української, італійської, азійської та американської кухні, готелі, SPA-комплекс VODA club, «Баньку на дровах» та інвестиційні проєкти.</p><p>Ми постійно розвиваємося, щоб створити новий рівень відпочинку в Україні.</p>', '<p>In 2004 we launched our first gastronomy projects in Bukovel. Today CARTEL is a hospitality group that brings together restaurants of Ukrainian, Italian, Asian and American cuisine, hotels, the VODA club SPA complex, the wood-fired bathhouse “Banka na Drovakh” and investment projects.</p><p>We keep growing to create a new standard of leisure in Ukraine.</p>'), image: im['le-grand'], position: 'right', theme: 'light', button_label: T('Історія компанії', 'Our story'), button_url: '/about' }),
    block('brands_index', { title: T('Наші бренди', 'Our brands'), intro: T('Кожен заклад має власний характер, кухню та атмосферу.', 'Every venue has its own character, cuisine and atmosphere.'), ids: ['teppan', 'le-grand', 'veranda', 'yeti', 'filvarok', 'mountain-residence', 'buka-apart-hotel', 'voda-club', 'banka-na-drovah'].map((k) => brandIds[k]), button_label: T('Каталог і карта', 'Catalogue and map'), button_url: '/brands' }),
    block('project_feature', { project: mrId, eyebrow: T('Інвестиційний проєкт', 'Investment project'), layout: 'cover' }),
    block('stats', { title: T('CARTEL у цифрах', 'CARTEL in figures'), theme: 'light', items: [
      { value: '2004', label: T('рік заснування', 'year founded') },
      { value: '17', label: T('ресторанів', 'restaurants') },
      { value: '2', label: T('готелі в Буковелі', 'hotels in Bukovel') },
      { value: '3', label: T('міста: Буковель, Яремче, Одеса', 'cities: Bukovel, Yaremche, Odesa') },
    ] }),
    block('cards', { title: T('Як ми працюємо', 'How we work'), intro: T('', ''), columns: '4', theme: 'dark', items: [
      { image: null, title: T('Європейська якість вдома', 'European quality at home'), text: T('Наша ідея — дати українцям відпочинок у себе вдома з рівнем сервісу, якому позаздрили б європейські курорти.', 'Our idea is to offer Ukrainians a holiday at home with a level of service that European resorts would envy.'), link_label: T('', ''), url: '' },
      { image: null, title: T('Здоровий відпочинок', 'Healthy leisure'), text: T('Гастрономія, SPA, баня та проживання в одній екосистемі, щоб гість справді відновлювався.', 'Food, SPA, bathhouse and accommodation in one ecosystem, so that guests truly recharge.'), link_label: T('', ''), url: '' },
      { image: null, title: T('Щаслива команда', 'A happy team'), text: T('Наш успіх тримається на організованості й професіоналізмі кожного працівника.', 'Our success rests on the organisation and professionalism of every team member.'), link_label: T('', ''), url: '' },
      { image: null, title: T('Постійний розвиток', 'Constant growth'), text: T('Нові заклади, готелі та інвестиційні проєкти щороку піднімають стандарти курорту.', 'New venues, hotels and investment projects raise the resort’s standards every year.'), link_label: T('', ''), url: '' },
    ] }),
    block('quotes', { title: T('Про нас говорять', 'What people say'), ids: [] }),
    block('cta', { title: T('Станьте частиною CARTEL', 'Become part of CARTEL'), text: T('Приєднуйтесь до команди або запропонуйте співпрацю.', 'Join our team or propose a partnership.'), image: im['team-photo'], button_label: T('Вакансії', 'Careers'), button_url: '/vacancies', button2_label: T('Співпраця', 'Cooperation'), button2_url: '/cooperation' }),
  ], { seo_description: T('CARTEL — ресторани, готелі та SPA у Буковелі, Яремче та Одесі з 2004 року. VODA club, Mountain Residence, BUKA Apart-Hotel, TEPPAN, LE GRAND та інші бренди.', 'CARTEL — restaurants, hotels and SPA in Bukovel, Yaremche and Odesa since 2004. VODA club, Mountain Residence, BUKA Apart-Hotel, TEPPAN, LE GRAND and more.') });

  page('about', T('Про компанію', 'About'), [
    block('hero', { title: T('Історія пошуку ідеального смаку', 'A story of searching for the perfect taste'), subtitle: T('CARTEL бере свій початок у 2004 році — це історія про постійне вдосконалення і людей, які створюють новий рівень відпочинку в Україні.', 'CARTEL began in 2004 — a story of constant improvement and of the people who create a new standard of leisure in Ukraine.'), image: im['hero-bg'], size: 'tall', button_label: T('', ''), button_url: '', button2_label: T('', ''), button2_url: '' }),
    block('text', { title: T('Від першого ресторану до холдингу', 'From the first restaurant to a hospitality group'), layout: 'split', theme: 'light', body: T('<p>У 2004 році ми почали реалізовувати перші гастрономічні проєкти у «Буковелі».</p><p>За роки роботи CARTEL відкрив понад 18 ресторанів — української, італійської, азійської та американської кухні, а також мережу швидкого харчування Eat’n’Go!. Найсучасніші гастрономічні тенденції, відмінний сервіс і особлива атмосфера — три основи, на яких тримається сімʼя ресторанів CARTEL.</p><p>Сьогодні діяльність CARTEL давно вийшла за межі громадського харчування: до холдингу входять SPA-комплекс, автентична банька на дровах, готелі та обʼєкти нерухомості.</p>', '<p>In 2004 we launched our first gastronomy projects in Bukovel.</p><p>Over the years CARTEL has opened more than 18 restaurants — Ukrainian, Italian, Asian and American — and the Eat’n’Go! quick-service chain. Current gastronomy trends, excellent service and a special atmosphere are the three pillars of the CARTEL restaurant family.</p><p>Today CARTEL goes far beyond food service: the group includes a SPA complex, a traditional wood-fired bathhouse, hotels and real estate.</p>') }),
    block('timeline', { title: T('Етапи розвитку', 'Milestones'), items: [
      { year: '2004', title: T('Перші гастрономічні проєкти у Буковелі', 'First gastronomy projects in Bukovel'), text: T('Старт сімʼї ресторанів CARTEL на курорті.', 'The CARTEL restaurant family starts at the resort.'), image: null },
      { year: '2014', title: T('Сторінка історії', 'A page of history'), text: T('До 2014 року ресторани CARTEL працювали також у Форосі. Через окупацію Криму компанія втратила можливість керувати закладами «Автограф», «Olivia» та «Альбатрос».', 'Until 2014 CARTEL also ran restaurants in Foros. Because of the occupation of Crimea, the company lost the ability to operate Avtohraf, Olivia and Albatros.'), image: null },
      { year: '2015', title: T('Відкриття VODA club', 'VODA club opens'), text: T('Відпочинковий SPA-комплекс на озері Молодості.', 'A leisure and SPA complex on Lake Molodosti.'), image: null },
      { year: T('Сьогодні', 'Today'), title: T('Холдинг гостинності', 'A hospitality group'), text: T('Ресторани, готелі, SPA та інвестиційні проєкти у Буковелі, Яремче й Одесі.', 'Restaurants, hotels, SPA and investment projects in Bukovel, Yaremche and Odesa.'), image: null },
    ] }),
    block('text_image', { title: T('Філософія гостинності', 'Our philosophy of hospitality'), body: T('<p><strong>Смакуй. Відпочивай. Насолоджуйся.</strong></p><p>Наша основна ідея — дати можливість українцям доступно відпочивати в себе вдома, отримуючи якість послуг, якій позаздрили б навіть європейці. Ми сповідуємо філософію здорового та якісного відпочинку.</p>', '<p><strong>Taste. Rest. Enjoy.</strong></p><p>Our core idea is to let Ukrainians enjoy affordable holidays at home with a quality of service that even Europeans would envy. We believe in healthy, high-quality leisure.</p>'), image: im['le-grand'], position: 'left', theme: 'light', button_label: T('', ''), button_url: '' }),
    block('text_image', { title: T('Команда', 'Our team'), body: T('<p>«CARTEL — це бренд, який сповідує філософію високих стандартів. Це команда щасливих людей, які дарують радість та незабутні емоції гостям. Ми любимо підкорювати нові вершини, тому кількість проєктів постійно зростає — все завдяки команді талановитих, професійних та, звісно ж, щасливих людей!»</p>', '<p>“CARTEL is a brand built on high standards. It is a team of happy people who bring joy and unforgettable emotions to our guests. We love conquering new heights, so the number of projects keeps growing — all thanks to a team of talented, professional and, of course, happy people!”</p>'), image: im['team-photo'], position: 'right', theme: 'dark', button_label: T('Вакансії', 'Careers'), button_url: '/vacancies' }),
    block('team', { title: T('Ключові представники команди', 'Leadership'), intro: T('', '') }),
    block('awards', { title: T('Нагороди та досягнення', 'Awards and achievements'), items: [] }),
    block('events', { title: T('Signature Events', 'Signature Events'), intro: T('Знакові події, які відбувалися в закладах CARTEL.', 'Landmark events hosted at CARTEL venues.') }),
    block('quotes', { title: T('Про нас говорять', 'What people say'), ids: [] }),
  ]);

  page('brands', T('Наші бренди', 'Our brands'), [
    block('hero', { title: T('Наші бренди', 'Our brands'), subtitle: T('Ресторани, готелі та SPA CARTEL — від гуцульської колиби до après-ski тераси.', 'CARTEL restaurants, hotels and SPA — from a Hutsul kolyba to an après-ski terrace.'), image: im.veranda, size: 'compact', button_label: T('', ''), button_url: '', button2_label: T('', ''), button2_url: '' }),
    block('brand_catalog', { title: T('', ''), show_map: true }),
  ]);

  page('investments', T('Інвестиції', 'Investments'), [
    block('hero', { title: T('Інвестиційні проєкти', 'Investment projects'), subtitle: T('Проєкти, у яких CARTEL поєднує досвід гостинності й нерухомості.', 'Projects where CARTEL combines its hospitality and real-estate experience.'), image: im['mountain-residence'], size: 'tall', button_label: T('', ''), button_url: '', button2_label: T('', ''), button2_url: '' }),
    block('text', { title: T('Інвестуйте разом з CARTEL', 'Invest with CARTEL'), layout: 'narrow', theme: 'light', body: T('<p>Понад двадцять років ми будуємо та керуємо закладами у Буковелі. Наші інвестиційні проєкти спираються на цей досвід: локації, сервіс і готову інфраструктуру курорту.</p>', '<p>For more than twenty years we have been building and operating venues in Bukovel. Our investment projects rest on that experience: location, service and the resort’s ready infrastructure.</p>') }),
    block('project_feature', { project: mrId, eyebrow: T('Пріоритетний проєкт', 'Priority project'), layout: 'split' }),
    block('projects_list', { title: T('Усі проєкти', 'All projects') }, true),
  ]);

  page('cooperation', T('Співпраця', 'Cooperation'), [
    block('hero', { title: T('Співпраця з CARTEL', 'Partner with CARTEL'), subtitle: T('Ми відкриті до партнерств із компаніями, брендами та авторами, які поділяють наші стандарти.', 'We are open to partnerships with companies, brands and creators who share our standards.'), image: im['le-grand'], size: 'compact', button_label: T('Залишити заявку', 'Send a request'), button_url: '#form', button2_label: T('', ''), button2_url: '' }),
    block('cards', { title: T('Два напрями співпраці', 'Two ways to work with us'), intro: T('', ''), columns: '2', theme: 'light', items: [
      { image: im.teppan, title: T('Business Cooperation', 'Business Cooperation'), text: T('Для компаній, брендів і партнерів: спільні проєкти, постачання, події, презентації та спецпропозиції в закладах CARTEL.', 'For companies, brands and partners: joint projects, supply, events, product launches and special offers at CARTEL venues.'), link_label: T('Залишити заявку', 'Send a request'), url: '#form' },
      { image: im.yeti, title: T('Creators & Influencers', 'Creators & Influencers'), text: T('Для блогерів і медійних осіб: колаборації, тревел-контент, спецпроєкти та запрошення на події.', 'For bloggers and media personalities: collaborations, travel content, special projects and event invitations.'), link_label: T('Залишити заявку', 'Send a request'), url: '#form' },
    ] }),
    block('form', { form: 'cooperation', title: T('Розкажіть про вашу ідею', 'Tell us about your idea'), intro: T('Опишіть пропозицію — ми відповімо протягом кількох робочих днів.', 'Describe your proposal — we will reply within a few working days.') }),
  ]);

  page('vacancies', T('Вакансії', 'Careers'), [
    block('hero', { title: T('Робота в CARTEL', 'Work at CARTEL'), subtitle: T('Команда щасливих людей, які обожнюють свою роботу, у наймальовничішому куточку України.', 'A team of happy people who love their work, in the most picturesque corner of Ukraine.'), image: im['team-photo'], size: 'tall', button_label: T('Відкриті вакансії', 'Open positions'), button_url: '#vacancies', button2_label: T('', ''), button2_url: '' }),
    block('text_image', { title: T('CARTEL як роботодавець', 'CARTEL as an employer'), body: T('<p>Понад 15 років CARTEL працює у сфері ресторанного й готельного бізнесу, нерухомості та розваг. Запорука нашого успіху — організованість і професіоналізм кожного працівника.</p><p>Ми відкриті для ініціативних і творчих фахівців, які прагнуть розвиватися. У CARTEL ви знайдете не лише гідно оплачувану роботу в горах, а й станете частиною великої та дружньої сімʼї.</p>', '<p>For more than 15 years CARTEL has worked in restaurants, hotels, real estate and entertainment. The key to our success is the organisation and professionalism of every team member.</p><p>We welcome proactive and creative people who want to grow. At CARTEL you will find well-paid work in the mountains and become part of a big, friendly family.</p>'), image: im.veranda, position: 'right', theme: 'light', button_label: T('', ''), button_url: '' }),
    block('cards', { title: T('Корпоративна культура', 'Our culture'), intro: T('', ''), columns: '3', theme: 'light', items: [
      { image: null, title: T('Розвиток', 'Growth'), text: T('Ініціативні люди ростуть разом із компанією — від лінійних позицій до керування закладами.', 'Proactive people grow with the company — from front-line roles to running venues.'), link_label: T('', ''), url: '' },
      { image: null, title: T('Команда', 'Team'), text: T('Ми — велика і дружня сімʼя, де цінують організованість і професіоналізм.', 'We are a big, friendly family that values organisation and professionalism.'), link_label: T('', ''), url: '' },
      { image: null, title: T('Локація', 'Location'), text: T('Робота в наймальовничішому куточку України — у Карпатах, на провідному курорті країни.', 'Work in the most picturesque corner of Ukraine — in the Carpathians, at the country’s leading resort.'), link_label: T('', ''), url: '' },
    ] }),
    block('stories', { title: T('Історії кар’єрного зростання', 'Career stories') }),
    block('vacancies_list', { title: T('Актуальні вакансії', 'Open positions'), intro: T('Оберіть вакансію або надішліть загальну анкету — рекрутер звʼяжеться з вами.', 'Choose a position or send a general application — our recruiter will contact you.') }),
    block('recruiter', { title: T('Звʼяжіться з рекрутером', 'Talk to our recruiter'), text: T('Відповімо на питання про роботу та умови.', 'We will answer your questions about the job and conditions.') }),
  ]);

  page('contacts', T('Контакти', 'Contacts'), [
    block('contacts', { title: T('Офіс CARTEL', 'CARTEL head office'), text: T('Зателефонуйте, напишіть або знайдіть нас у Буковелі, Яремче чи Одесі.', 'Call, write or find us in Bukovel, Yaremche or Odesa.') }),
    block('directory', { title: T('Наші заклади', 'Our venues') }),
    block('form', { form: 'contact', title: T('Напишіть нам', 'Write to us'), intro: T('Оберіть тему — лист одразу потрапить до потрібного відділу.', 'Choose a subject — your message goes straight to the right team.') }),
  ]);

  page('privacy', T('Політика конфіденційності', 'Privacy policy'), [
    block('text', { title: T('', ''), layout: 'narrow', theme: 'light', body: T(
      '<p><strong>Шаблон — потребує перевірки юристом CARTEL перед запуском.</strong></p><h3>Які дані ми збираємо</h3><p>Через форми на сайті ми отримуємо імʼя, телефон, email, назву компанії, посилання на соцмережі, текст звернення та, для кандидатів, резюме. Ці дані ви надаєте добровільно.</p><h3>Для чого</h3><p>Щоб відповісти на звернення, розглянути пропозицію про співпрацю або кандидатуру на вакансію.</p><h3>Хто має доступ</h3><p>Лише уповноважені працівники CARTEL: заявки на співпрацю та звернення — відділ маркетингу, відгуки на вакансії — відділ персоналу.</p><h3>Скільки зберігаємо</h3><p>Не довше, ніж потрібно для мети обробки, або до вашого запиту на видалення.</p><h3>Cookies та аналітика</h3><p>Аналітичні cookies (Google Analytics, Meta Pixel) вмикаються лише після вашої згоди в банері. Змінити вибір можна за посиланням «Налаштування cookies» внизу сторінки.</p><h3>Ваші права</h3><p>Ви можете запросити доступ до своїх даних, їх виправлення або видалення, написавши на email, вказаний на сторінці «Контакти».</p>',
      '<p><strong>Template — to be reviewed by CARTEL’s legal counsel before launch.</strong></p><h3>What we collect</h3><p>Through the forms on this website we receive your name, phone, email, company, social media links, your message and, for candidates, a CV. You provide this data voluntarily.</p><h3>Why</h3><p>To reply to your request, consider a partnership proposal or a job application.</p><h3>Who has access</h3><p>Only authorised CARTEL staff: partnership and contact requests — the marketing team; job applications — the HR team.</p><h3>How long</h3><p>No longer than needed for the purpose, or until you ask us to delete it.</p><h3>Cookies and analytics</h3><p>Analytics cookies (Google Analytics, Meta Pixel) are enabled only after you agree in the cookie banner. You can change your choice via “Cookie settings” at the bottom of the page.</p><h3>Your rights</h3><p>You can request access to, correction or deletion of your data by writing to the email listed on the Contacts page.</p>') }),
  ], { noindex: false });
}

function seedSettings() {
  setSetting('languages', [{ code: 'uk', name: 'Українська', short: 'UA' }, { code: 'en', name: 'English', short: 'EN' }], null, { revision: false });
  setSetting('company', {
    phones: [
      { label: T('Загальне бронювання', 'Reservations'), number: '+38 (067) 344-10-99' },
      { label: T('Корпоративи, бенкети, весілля', 'Corporate events and weddings'), number: '+38 (067) 350-34-44' },
    ],
    emails: [
      { label: T('Події та бенкети', 'Events'), email: 'event@carte-l.com' },
      { label: T('Маркетинг і співпраця', 'Marketing & partnerships'), email: 'cartel.marketing.info@gmail.com' },
    ],
    address: T('с. Поляниця, ТК «Буковель», Івано-Франківська обл., Україна', 'Polianytsia, Bukovel resort, Ivano-Frankivsk region, Ukraine'),
    map_url: 'https://maps.google.com/?q=Bukovel+Ukraine',
    hours: T('Щодня 09:00–23:00', 'Daily 09:00–23:00'),
    legal_name: T('CARTEL Holding', 'CARTEL Holding'),
    legal_text: T('Усі права захищено', 'All rights reserved'),
    footer_text: T('Ресторани, готелі та SPA у Буковелі, Яремче та Одесі.', 'Restaurants, hotels and SPA in Bukovel, Yaremche and Odesa.'),
    since: '2004',
  }, null, { revision: false });
  setSetting('social', {
    instagram: 'https://www.instagram.com/cartel_holding_bukovel/',
    facebook: 'https://www.facebook.com/cartel.holding.bukovel/',
    youtube: 'https://www.youtube.com/channel/UC_T20_w1yW4Lbv1dhOaYIew',
    tiktok: '', telegram: '', linkedin: '',
  }, null, { revision: false });
  setSetting('hr', { recruiter_name: '', phone: '+38 (067) 344-14-13', email: 'hr@carte-l.com', telegram: '', viber: '', instagram: '', other: [], recipients: 'hr@carte-l.com', peopleforce_enabled: false }, null, { revision: false });
  setSetting('forms', {
    cooperation_to: 'cartel.marketing.info@gmail.com',
    contact_to: 'cartel.marketing.info@gmail.com',
    turnstile_site_key: '',
    contact_topics: [
      { label: T('Бронювання та загальні питання', 'Reservations and general questions'), email: 'cartel.marketing.info@gmail.com' },
      { label: T('Корпоративи, бенкети, весілля', 'Corporate events and weddings'), email: 'event@carte-l.com' },
      { label: T('Працевлаштування', 'Careers'), email: 'hr@carte-l.com' },
      { label: T('Маркетинг', 'Marketing'), email: 'cartel.marketing.info@gmail.com' },
      { label: T('Постачання продуктів', 'Food supply'), email: 'zakaz@carte-l.com' },
      { label: T('Закупівля обладнання', 'Equipment purchasing'), email: 'kondratiev@carte-l.com' },
    ],
  }, null, { revision: false });
  setSetting('analytics', { gtm_id: '', ga4_id: '', pixel_id: '', google_verification: '', cookie_banner: true }, null, { revision: false });
  setSetting('seo', { title_suffix: T('CARTEL', 'CARTEL'), default_description: T('CARTEL — ресторани, готелі та SPA у Буковелі, Яремче та Одесі з 2004 року.', 'CARTEL — restaurants, hotels and SPA in Bukovel, Yaremche and Odesa since 2004.'), default_image: null }, null, { revision: false });
  setSetting('maps', { tile_url: '', attribution: '' }, null, { revision: false });
  setSetting('strings', {}, null, { revision: false });
}

function seedRedirects() {
  const r = [
    ['/restaurants', '/brands?c=restaurant'], ['/hotels', '/brands?c=hotel'], ['/spa', '/brands?c=spa'],
    ['/voda-club', '/brands/voda-club'], ['/banya', '/brands/banka-na-drovah'], ['/fast-food', '/brands/eat-n-go'],
    ['/team', '/about#team'], ['/blog', '/'], ['/hotels/buka-apart-hotel', '/brands/buka-apart-hotel'], ['/hotels/mountain-residence', '/brands/mountain-residence'],
    ['/restaurants/jagermeister', '/brands/jagermeister-apres-ski-zone'], ['/restaurants/buka', '/brands?c=restaurant'], ['/restaurants/lucky-bull', '/brands?c=restaurant'],
    ...['teppan', 'le-grand', 'veranda', 'yeti', 'asia-garden', 'living-room', 'girafa', 'kolyba', 'osteria-italiana', 'plov', 'rebra-bbq', 'riba-grill', 'panorama-lounge', 'filvarok', 'salo', 'mangalica'].map((s) => [`/restaurants/${s}`, `/brands/${s}`]),
  ];
  const st = db.prepare('INSERT OR IGNORE INTO redirects(from_path, to_path, code, created_at) VALUES (?,?,301,?)');
  for (const [a, b] of r) st.run(a, b, now());
}

function seedAdmin() {
  if (db.prepare('SELECT COUNT(*) n FROM users').get().n) return;
  const email = process.env.ADMIN_EMAIL || 'admin@cartel.ua';
  const pw = process.env.ADMIN_PASSWORD && !sec.passwordProblems(process.env.ADMIN_PASSWORD) ? process.env.ADMIN_PASSWORD : crypto.randomBytes(12).toString('base64url') + '7a';
  db.prepare('INSERT INTO users(email, name, role, pass_hash, must_change_pw, created_at) VALUES (?,?,?,?,1,?)').run(email, 'Адміністратор', 'admin', sec.hashPassword(pw), now());
  if (!process.env.ADMIN_PASSWORD) {
    const f = path.join(config.DATA_DIR, 'INITIAL_ADMIN_PASSWORD.txt');
    fs.writeFileSync(f, `CMS: ${config.baseUrl}${config.adminPath}\nEmail: ${email}\nPassword: ${pw}\n\nЗмініть пароль після першого входу і видаліть цей файл.\n`, { mode: 0o600 });
    console.log(`\n[seed] Створено адміністратора ${email}. Пароль збережено у ${f}\n`);
  }
}

async function ensureSeed() {
  const hasPages = db.prepare("SELECT COUNT(*) n FROM entries WHERE type='page'").get().n > 0;
  if (!getSetting('languages')) seedSettings();
  if (!hasPages) {
    console.log('[seed] Empty database — creating initial content…');
    await seedContent();
    seedRedirects();
    const { applyPhotos } = require('./photos');
    const r = await applyPhotos();
    console.log(`[seed] Photos attached: ${r.photos}`);
  }
  seedAdmin();
}

module.exports = { ensureSeed };
