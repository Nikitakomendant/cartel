'use strict';
/** CMS settings pages. Each page edits one stored setting with the same editor as content. */
const sec = require('./security');
const schema = require('./schema');

const emailsOk = (s) => !s || String(s).split(/[,;\s]+/).filter(Boolean).every(sec.isEmail);

module.exports = {
  company: {
    label: 'Контакти компанії', perm: 'contacts', key: 'company',
    help: 'Ці дані показуються у футері, на сторінці «Контакти» та в блоці «Контакти компанії».',
    groups: [
      { label: 'Телефони та email', fields: [
        { key: 'phones', type: 'items', label: 'Телефони', item: 'телефон', fields: [
          { key: 'label', type: 'text', t: true, label: 'Підпис (напр. «Бронювання»)' },
          { key: 'number', type: 'phone', label: 'Номер' },
        ] },
        { key: 'emails', type: 'items', label: 'Email', item: 'email', fields: [
          { key: 'label', type: 'text', t: true, label: 'Підпис' },
          { key: 'email', type: 'email', label: 'Адреса' },
        ] },
      ] },
      { label: 'Адреса', fields: [
        { key: 'address', type: 'text', t: true, label: 'Адреса офісу' },
        { key: 'map_url', type: 'url', label: 'Посилання на карту' },
        { key: 'hours', type: 'text', t: true, label: 'Години роботи' },
      ] },
      { label: 'Футер і юридична інформація', fields: [
        { key: 'footer_text', type: 'textarea', t: true, label: 'Текст у футері' },
        { key: 'legal_name', type: 'text', t: true, label: 'Юридична назва' },
        { key: 'legal_text', type: 'text', t: true, label: 'Юридичний рядок (ЄДРПОУ тощо)' },
        { key: 'since', type: 'text', label: 'Рік заснування (для ©)' },
      ] },
    ],
  },
  social: {
    label: 'Соцмережі', perm: 'contacts', key: 'social',
    groups: [{ label: 'Посилання на сторінки CARTEL', fields: [
      { key: 'instagram', type: 'url', label: 'Instagram' },
      { key: 'facebook', type: 'url', label: 'Facebook' },
      { key: 'youtube', type: 'url', label: 'YouTube' },
      { key: 'tiktok', type: 'url', label: 'TikTok' },
      { key: 'telegram', type: 'url', label: 'Telegram' },
      { key: 'linkedin', type: 'url', label: 'LinkedIn' },
    ] }],
  },
  hr: {
    label: 'Контакти рекрутера і заявки', perm: 'hr_contacts', key: 'hr',
    help: 'Контакти показуються на сторінці «Вакансії» та на сторінках вакансій.',
    groups: [
      { label: 'Контакти рекрутера', fields: [
        { key: 'recruiter_name', type: 'text', label: 'Імʼя рекрутера (необовʼязково)' },
        { key: 'phone', type: 'phone', label: 'Телефон' },
        { key: 'email', type: 'email', label: 'Email' },
        { key: 'telegram', type: 'url', label: 'Telegram (посилання https://t.me/…)' },
        { key: 'viber', type: 'phone', label: 'Viber (номер)' },
        { key: 'instagram', type: 'url', label: 'Instagram' },
        { key: 'other', type: 'items', label: 'Інші контакти', item: 'контакт', fields: [
          { key: 'label', type: 'text', label: 'Назва (напр. WhatsApp)' },
          { key: 'url', type: 'url', label: 'Посилання' },
        ] },
      ] },
      { label: 'Куди надсилати відгуки', fields: [
        { key: 'recipients', type: 'text', label: 'Email рекрутера(ів)', help: 'Кілька адрес — через кому. Резюме приходить у вкладенні.' },
        { key: 'peopleforce_enabled', type: 'toggle', label: 'Дублювати кандидатів у PeopleForce', help: 'Працює, якщо адміністратор додав ключ PeopleForce на сервері.' },
      ] },
    ],
    validate: (d) => (emailsOk(d.recipients) ? null : 'Перевірте email у полі «Email рекрутера».'),
  },
  forms: {
    label: 'Форми та захист від спаму', perm: '*', key: 'forms',
    groups: [
      { label: 'Отримувачі заявок', fields: [
        { key: 'cooperation_to', type: 'text', label: 'Співпраця → email', help: 'Кілька адрес — через кому.' },
        { key: 'contact_to', type: 'text', label: 'Контакти → email за замовчуванням' },
        { key: 'contact_topics', type: 'items', label: 'Теми звернень на сторінці «Контакти»', item: 'тему', help: 'Кожна тема може йти на свою адресу.', fields: [
          { key: 'label', type: 'text', t: true, label: 'Тема' },
          { key: 'email', type: 'email', label: 'Email відділу' },
        ] },
      ] },
      { label: 'Cloudflare Turnstile (необовʼязково)', fields: [
        { key: 'turnstile_site_key', type: 'text', label: 'Site key', help: 'Додатковий невидимий захист від ботів. Secret key задається на сервері (TURNSTILE_SECRET).' },
      ] },
    ],
    validate: (d) => (emailsOk(d.cooperation_to) && emailsOk(d.contact_to) ? null : 'Перевірте адреси email.'),
  },
  analytics: {
    label: 'Аналітика', perm: '*', key: 'analytics',
    groups: [{ label: 'Google та Meta', fields: [
      { key: 'gtm_id', type: 'text', label: 'Google Tag Manager ID', help: 'Формат GTM-XXXXXXX. Якщо задано GTM, GA4 підключайте всередині GTM.' },
      { key: 'ga4_id', type: 'text', label: 'Google Analytics 4 ID', help: 'Формат G-XXXXXXXXXX. Використовується, лише якщо GTM не задано.' },
      { key: 'pixel_id', type: 'text', label: 'Meta Pixel ID', help: 'Лише цифри.' },
      { key: 'google_verification', type: 'text', label: 'Google Search Console: код підтвердження' },
      { key: 'cookie_banner', type: 'toggle', label: 'Показувати банер згоди на cookies', default: true },
    ] }],
    validate: (d) => {
      if (d.gtm_id && !/^GTM-[A-Z0-9]{4,12}$/.test(d.gtm_id)) return 'GTM ID має формат GTM-XXXXXXX.';
      if (d.ga4_id && !/^G-[A-Z0-9]{4,14}$/.test(d.ga4_id)) return 'GA4 ID має формат G-XXXXXXXXXX.';
      if (d.pixel_id && !/^\d{8,20}$/.test(d.pixel_id)) return 'Meta Pixel ID — лише цифри.';
      if (d.google_verification && !/^[A-Za-z0-9_-]{10,100}$/.test(d.google_verification)) return 'Код Search Console містить недопустимі символи.';
      return null;
    },
  },
  seo: {
    label: 'SEO за замовчуванням', perm: 'seo', key: 'seo',
    groups: [{ label: 'Загальні налаштування', fields: [
      { key: 'title_suffix', type: 'text', t: true, label: 'Назва сайту в заголовку вкладки', help: 'Додається після назви сторінки: «Контакти — CARTEL».' },
      { key: 'default_description', type: 'textarea', t: true, label: 'Опис за замовчуванням', max: 200 },
      { key: 'default_image', type: 'image', label: 'Картинка для соцмереж за замовчуванням' },
    ] }],
  },
  maps: {
    label: 'Карти', perm: '*', key: 'maps',
    groups: [{ label: 'Підкладка карти', fields: [
      { key: 'tile_url', type: 'url', label: 'URL плиток', help: 'Порожньо — OpenStreetMap. Для великого трафіку підключіть MapTiler або Mapbox: https://…/{z}/{x}/{y}.png?key=…' },
      { key: 'attribution', type: 'text', label: 'Підпис джерела карти' },
    ] }],
  },
  languages: {
    label: 'Мови сайту', perm: '*', key: 'languages', wrap: 'list',
    help: 'Перша мова — основна (без префікса в адресі). Нова мова зʼявиться в усіх полях редактора; поки текст не перекладено, показується основна мова.',
    groups: [{ label: 'Мови', fields: [
      { key: 'list', type: 'items', label: 'Мови', item: 'мову', fields: [
        { key: 'code', type: 'text', label: 'Код (2 літери: uk, en, pl…)', max: 2 },
        { key: 'name', type: 'text', label: 'Назва' },
        { key: 'short', type: 'text', label: 'Коротко в меню (UA, EN…)', max: 3 },
      ] },
    ] }],
    validate: (d) => {
      const l = d.list || [];
      if (!l.length) return 'Потрібна хоча б одна мова.';
      if (!l.every((x) => /^[a-z]{2}$/.test(x.code))) return 'Код мови — дві латинські літери.';
      if (new Set(l.map((x) => x.code)).size !== l.length) return 'Коди мов повторюються.';
      return null;
    },
    after: (d) => schema.setLanguages(d.list.map((x) => x.code)),
  },
};
