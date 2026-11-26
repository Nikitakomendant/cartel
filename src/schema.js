'use strict';
/**
 * Single source of truth for the CMS structure.
 *  - BLOCKS: the library of page sections (Hero, Text + photo, Gallery, …)
 *  - TYPES:  fields of every content type (brand, project, vacancy, …)
 * The admin editor is generated from this file, and `normalize()` uses the
 * same schema to validate and sanitise everything that comes from the CMS.
 *
 * Field types: text, textarea, rich, url, email, phone, number, date, select,
 * toggle, image, images, video, items (repeater), entry (link to another entry),
 * entries (several), latlng, list (list of short strings)
 * `t: true` — the field is translated (stored as { uk: '', en: '' }).
 */
const sec = require('./security');

const BTN_STYLES = [{ v: 'primary', l: 'Основна' }, { v: 'ghost', l: 'Контурна' }];
const CATEGORIES = [
  { v: 'restaurant', l: 'Ресторани' },
  { v: 'hotel', l: 'Готелі' },
  { v: 'spa', l: 'SPA' },
];
const FORMS = [
  { v: 'cooperation', l: 'Співпраця (Cooperation)' },
  { v: 'contact', l: 'Звернення (Contacts)' },
];
const THEMES = [{ v: 'light', l: 'Світле тло' }, { v: 'dark', l: 'Темне тло' }];

const button = (prefix = 'button', label = 'Кнопка') => [
  { key: `${prefix}_label`, type: 'text', t: true, label: `${label}: текст` },
  { key: `${prefix}_url`, type: 'url', label: `${label}: посилання`, help: 'Повна адреса (https://…) або шлях на сайті (/brands)' },
];

const BLOCKS = {
  hero: {
    label: 'Hero (головний екран)', icon: '▣',
    help: 'Великий перший екран з фото або відео. Один на сторінку, ставте першим.',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок', max: 160 },
      { key: 'subtitle', type: 'textarea', t: true, label: 'Підзаголовок', max: 400 },
      { key: 'image', type: 'image', label: 'Фото (також — обкладинка відео)' },
      { key: 'video', type: 'video', label: 'Відео (необовʼязково, MP4 без звуку)' },
      { key: 'size', type: 'select', label: 'Висота', options: [{ v: 'full', l: 'На весь екран' }, { v: 'tall', l: 'Висока' }, { v: 'compact', l: 'Компактна' }], default: 'full' },
      ...button('button', 'Кнопка'),
      ...button('button2', 'Друга кнопка'),
    ],
  },
  text: {
    label: 'Текст', icon: '¶',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'body', type: 'rich', t: true, label: 'Текст' },
      { key: 'layout', type: 'select', label: 'Розташування', options: [{ v: 'split', l: 'Заголовок ліворуч, текст праворуч' }, { v: 'narrow', l: 'Вузька колонка' }], default: 'split' },
      { key: 'theme', type: 'select', label: 'Тло', options: THEMES, default: 'light' },
    ],
  },
  text_image: {
    label: 'Текст із фото', icon: '◧',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'body', type: 'rich', t: true, label: 'Текст' },
      { key: 'image', type: 'image', label: 'Фото' },
      { key: 'position', type: 'select', label: 'Фото', options: [{ v: 'right', l: 'Праворуч' }, { v: 'left', l: 'Ліворуч' }], default: 'right' },
      { key: 'theme', type: 'select', label: 'Тло', options: THEMES, default: 'light' },
      ...button(),
    ],
  },
  image: {
    label: 'Велике зображення', icon: '▭',
    fields: [
      { key: 'image', type: 'image', label: 'Фото' },
      { key: 'caption', type: 'text', t: true, label: 'Підпис' },
      { key: 'width', type: 'select', label: 'Ширина', options: [{ v: 'full', l: 'На всю ширину' }, { v: 'contained', l: 'У межах сітки' }], default: 'full' },
    ],
  },
  gallery: {
    label: 'Галерея', icon: '▦',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'images', type: 'images', label: 'Фото' },
    ],
  },
  video: {
    label: 'Відео', icon: '▶',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'video', type: 'video', label: 'Відеофайл' },
      { key: 'embed', type: 'url', label: 'Або посилання YouTube / Vimeo' },
      { key: 'poster', type: 'image', label: 'Обкладинка' },
      { key: 'caption', type: 'text', t: true, label: 'Підпис' },
    ],
  },
  stats: {
    label: 'Показники (цифри)', icon: '#',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'items', type: 'items', label: 'Показники', item: 'показник', fields: [
        { key: 'value', type: 'text', label: 'Число', max: 20, help: 'Напр. 20+, 2004, 3 000' },
        { key: 'label', type: 'text', t: true, label: 'Підпис' },
      ] },
      { key: 'theme', type: 'select', label: 'Тло', options: THEMES, default: 'light' },
    ],
  },
  cards: {
    label: 'Картки / акценти', icon: '▤',
    help: 'Принципи роботи, цінності, напрями співпраці, акценти проєктів.',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Вступ' },
      { key: 'columns', type: 'select', label: 'Колонок', options: [{ v: '2', l: '2' }, { v: '3', l: '3' }, { v: '4', l: '4' }], default: '3' },
      { key: 'theme', type: 'select', label: 'Тло', options: THEMES, default: 'light' },
      { key: 'items', type: 'items', label: 'Картки', item: 'картку', fields: [
        { key: 'image', type: 'image', label: 'Фото (необовʼязково)' },
        { key: 'title', type: 'text', t: true, label: 'Заголовок' },
        { key: 'text', type: 'textarea', t: true, label: 'Текст' },
        { key: 'link_label', type: 'text', t: true, label: 'Текст посилання' },
        { key: 'url', type: 'url', label: 'Посилання' },
      ] },
    ],
  },
  quotes: {
    label: 'Цитати', icon: '❝',
    help: 'Показує цитати з розділу «Цитати». Можна обрати конкретні.',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'ids', type: 'entries', of: 'quote', label: 'Які цитати показати (порожньо — усі опубліковані)' },
    ],
  },
  cta: {
    label: 'Заклик до дії (CTA)', icon: '➜',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'text', type: 'textarea', t: true, label: 'Текст' },
      { key: 'image', type: 'image', label: 'Фонове фото (необовʼязково)' },
      ...button(),
      ...button('button2', 'Друга кнопка'),
    ],
  },
  contacts: {
    label: 'Контакти компанії', icon: '☎',
    help: 'Телефони, email, адреса та соцмережі з розділу «Контакти компанії».',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'text', type: 'textarea', t: true, label: 'Текст' },
    ],
  },
  brands_index: {
    label: 'Добірка брендів', icon: '✦',
    help: 'Список брендів з фото при наведенні. Порядок — як у розділі «Бренди».',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Вступ' },
      { key: 'ids', type: 'entries', of: 'brand', label: 'Бренди (порожньо — усі опубліковані)' },
      ...button('button', 'Кнопка під списком'),
    ],
  },
  brand_catalog: {
    label: 'Каталог брендів + карта', icon: '⊞',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'show_map', type: 'toggle', label: 'Показувати інтерактивну карту', default: true },
    ],
  },
  project_feature: {
    label: 'Акцентний проєкт', icon: '◆',
    help: 'Великий блок одного інвестиційного проєкту (напр. Mountain Residence).',
    fields: [
      { key: 'project', type: 'entry', of: 'project', label: 'Проєкт' },
      { key: 'eyebrow', type: 'text', t: true, label: 'Надпис над назвою' },
      { key: 'layout', type: 'select', label: 'Вигляд', options: [{ v: 'cover', l: 'Фото на весь блок' }, { v: 'split', l: 'Фото + текст' }], default: 'cover' },
    ],
  },
  projects_list: {
    label: 'Список інвестиційних проєктів', icon: '☰',
    fields: [{ key: 'title', type: 'text', t: true, label: 'Заголовок' }],
  },
  timeline: {
    label: 'Історія / етапи', icon: '⋮',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'items', type: 'items', label: 'Етапи', item: 'етап', fields: [
        { key: 'year', type: 'text', t: true, label: 'Рік / період', max: 20 },
        { key: 'title', type: 'text', t: true, label: 'Подія' },
        { key: 'text', type: 'textarea', t: true, label: 'Опис' },
        { key: 'image', type: 'image', label: 'Фото' },
      ] },
    ],
  },
  awards: {
    label: 'Нагороди та досягнення', icon: '✧',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'items', type: 'items', label: 'Нагороди', item: 'нагороду', fields: [
        { key: 'year', type: 'text', label: 'Рік', max: 12 },
        { key: 'title', type: 'text', t: true, label: 'Назва' },
        { key: 'text', type: 'text', t: true, label: 'Деталі (хто вручив, за що)' },
      ] },
    ],
  },
  team: {
    label: 'Команда', icon: '☺',
    help: 'Ключові представники з розділу «Команда».',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Вступ' },
    ],
  },
  events: {
    label: 'Signature Events (знакові події)', icon: '★',
    help: 'Добірка з розділу «Знакові події».',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Вступ' },
    ],
  },
  vacancies_list: {
    label: 'Актуальні вакансії', icon: '✎',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Вступ' },
    ],
  },
  stories: {
    label: 'Історії та відгуки працівників', icon: '✍',
    fields: [{ key: 'title', type: 'text', t: true, label: 'Заголовок' }],
  },
  recruiter: {
    label: 'Контакти рекрутера', icon: '✆',
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'text', type: 'textarea', t: true, label: 'Текст' },
    ],
  },
  form: {
    label: 'Форма звернення', icon: '✉',
    fields: [
      { key: 'form', type: 'select', label: 'Яка форма', options: FORMS, default: 'contact' },
      { key: 'title', type: 'text', t: true, label: 'Заголовок' },
      { key: 'intro', type: 'textarea', t: true, label: 'Текст' },
    ],
  },
  directory: {
    label: 'Контакти всіх обʼєктів', icon: '☷',
    help: 'Автоматичний список ресторанів, готелів і SPA з адресами й телефонами — дані беруться зі сторінок брендів.',
    fields: [{ key: 'title', type: 'text', t: true, label: 'Заголовок' }],
  },
};

const SEO = [
  { key: 'seo_title', type: 'text', t: true, label: 'SEO: title', max: 70, help: 'До 60–70 символів. Порожньо — береться назва.' },
  { key: 'seo_description', type: 'textarea', t: true, label: 'SEO: description', max: 200, help: '140–160 символів — показується у Google.' },
  { key: 'seo_image', type: 'image', label: 'Картинка для соцмереж (Open Graph)' },
  { key: 'noindex', type: 'toggle', label: 'Приховати від пошукових систем' },
];

const TYPES = {
  page: {
    label: 'Сторінки', single: 'сторінку', perm: 'content', blocks: true,
    groups: [
      { label: 'Основне', fields: [{ key: 'title', type: 'text', t: true, label: 'Назва сторінки', required: true }] },
      { label: 'SEO', fields: SEO },
    ],
  },
  brand: {
    label: 'Бренди', single: 'бренд', perm: 'content', blocks: true, slug: true, reorder: true,
    blocksLabel: 'Додаткові секції (необовʼязково)',
    groups: [
      { label: 'Основне', fields: [
        { key: 'name', type: 'text', t: true, label: 'Назва', required: true },
        { key: 'category', type: 'select', label: 'Категорія', options: CATEGORIES, default: 'restaurant', required: true },
        { key: 'city', type: 'text', t: true, label: 'Місто / локація (коротко)', help: 'Напр. Буковель' },
        { key: 'tagline', type: 'text', t: true, label: 'Короткий опис для картки', max: 160 },
        { key: 'notice', type: 'text', t: true, label: 'Оголошення (напр. «Тимчасово зачинено»)' },
        { key: 'description', type: 'rich', t: true, label: 'Опис' },
      ] },
      { label: 'Фото та відео', fields: [
        { key: 'hero', type: 'image', label: 'Головне фото (Hero)' },
        { key: 'hero_video', type: 'video', label: 'Відео для Hero (необовʼязково)' },
        { key: 'card', type: 'image', label: 'Фото для картки в каталозі', help: 'Порожньо — береться головне фото.' },
        { key: 'logo', type: 'image', label: 'Логотип (PNG з прозорим тлом)' },
        { key: 'gallery', type: 'images', label: 'Галерея' },
      ] },
      { label: 'Основна інформація', fields: [
        { key: 'info', type: 'items', label: 'Факти', item: 'рядок', help: 'Кухня, місткість, кількість номерів, сезон…', fields: [
          { key: 'label', type: 'text', t: true, label: 'Назва' },
          { key: 'value', type: 'text', t: true, label: 'Значення' },
        ] },
        { key: 'hours', type: 'text', t: true, label: 'Години роботи' },
      ] },
      { label: 'Адреса і карта', fields: [
        { key: 'address', type: 'text', t: true, label: 'Адреса' },
        { key: 'geo', type: 'latlng', label: 'Точка на карті', help: 'Клікніть на карті, щоб поставити мітку.' },
        { key: 'map_url', type: 'url', label: 'Посилання на Google Maps (необовʼязково)' },
      ] },
      { label: 'Контакти', fields: [
        { key: 'phones', type: 'list', label: 'Телефони', item: 'телефон' },
        { key: 'reception_phone', type: 'phone', label: 'Телефон рецепції (для готелів)' },
        { key: 'email', type: 'email', label: 'Email' },
      ] },
      { label: 'Посилання', fields: [
        { key: 'website', type: 'url', label: 'Офіційний сайт' },
        { key: 'menu_url', type: 'url', label: 'Меню' },
        { key: 'booking_url', type: 'url', label: 'Бронювання (зовнішня система)', help: 'Для готелів — обовʼязково. Кнопка «Забронювати».' },
        { key: 'links', type: 'items', label: 'Інші посилання', item: 'посилання', fields: [
          { key: 'label', type: 'text', t: true, label: 'Текст' },
          { key: 'url', type: 'url', label: 'Адреса' },
        ] },
        { key: 'instagram', type: 'url', label: 'Instagram' },
        { key: 'facebook', type: 'url', label: 'Facebook' },
        { key: 'tiktok', type: 'url', label: 'TikTok' },
        { key: 'youtube', type: 'url', label: 'YouTube' },
        { key: 'telegram', type: 'url', label: 'Telegram' },
      ] },
      { label: 'Які блоки показувати', fields: [
        { key: 'show_gallery', type: 'toggle', label: 'Галерея', default: true },
        { key: 'show_info', type: 'toggle', label: 'Основна інформація', default: true },
        { key: 'show_map', type: 'toggle', label: 'Адреса і карта', default: true },
        { key: 'show_contacts', type: 'toggle', label: 'Контакти', default: true },
        { key: 'show_social', type: 'toggle', label: 'Соцмережі', default: true },
        { key: 'show_in_contacts', type: 'toggle', label: 'Показувати на сторінці «Контакти»', default: true },
      ] },
      { label: 'SEO', fields: SEO },
    ],
  },
  project: {
    label: 'Інвестиційні проєкти', single: 'проєкт', perm: 'content', blocks: true, slug: true, reorder: true,
    blocksLabel: 'Презентаційні секції проєкту',
    groups: [
      { label: 'Основне', fields: [
        { key: 'title', type: 'text', t: true, label: 'Назва', required: true },
        { key: 'subtitle', type: 'text', t: true, label: 'Підзаголовок (напр. «Premium Villas & SPA»)' },
        { key: 'location', type: 'text', t: true, label: 'Локація' },
        { key: 'short', type: 'textarea', t: true, label: 'Короткий опис', max: 500 },
        { key: 'image', type: 'image', label: 'Велике фото' },
        { key: 'video', type: 'video', label: 'Відео (необовʼязково)' },
        { key: 'external_url', type: 'url', label: 'Офіційний сайт проєкту' },
        { key: 'button_label', type: 'text', t: true, label: 'Текст кнопки', help: 'Напр. «Перейти на сайт проєкту»' },
        { key: 'has_page', type: 'toggle', label: 'Окрема сторінка проєкту на cartel.ua', default: false },
      ] },
      { label: 'SEO', fields: SEO },
    ],
  },
  team: {
    label: 'Команда', single: 'людину', perm: 'content', reorder: true,
    fields: [
      { key: 'name', type: 'text', t: true, label: 'Імʼя та прізвище', required: true },
      { key: 'position', type: 'text', t: true, label: 'Посада' },
      { key: 'photo', type: 'image', label: 'Фото' },
      { key: 'bio', type: 'textarea', t: true, label: 'Коротко про людину', max: 600 },
    ],
  },
  quote: {
    label: 'Цитати', single: 'цитату', perm: 'content', reorder: true,
    fields: [
      { key: 'text', type: 'textarea', t: true, label: 'Цитата', required: true, max: 1200 },
      { key: 'author', type: 'text', t: true, label: 'Автор' },
      { key: 'role', type: 'text', t: true, label: 'Хто це (посада, компанія)' },
      { key: 'photo', type: 'image', label: 'Фото автора (необовʼязково)' },
    ],
  },
  event: {
    label: 'Знакові події', single: 'подію', perm: 'content', reorder: true,
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Назва події', required: true },
      { key: 'date', type: 'text', t: true, label: 'Дата / рік', help: 'Напр. «Серпень 2025»' },
      { key: 'caption', type: 'textarea', t: true, label: 'Короткий підпис', max: 500 },
      { key: 'cover', type: 'image', label: 'Головне фото' },
      { key: 'photos', type: 'images', label: 'Ще фото' },
      { key: 'video', type: 'video', label: 'Відео (необовʼязково)' },
      { key: 'embed', type: 'url', label: 'Або посилання YouTube' },
    ],
  },
  vacancy: {
    label: 'Вакансії', single: 'вакансію', perm: 'vacancies', slug: true, reorder: true,
    fields: [
      { key: 'title', type: 'text', t: true, label: 'Посада', required: true },
      { key: 'location', type: 'text', t: true, label: 'Локація', help: 'Напр. «Буковель, ресторан TEPPAN»' },
      { key: 'brand', type: 'entry', of: 'brand', label: 'Заклад (необовʼязково)' },
      { key: 'employment', type: 'text', t: true, label: 'Графік / тип зайнятості' },
      { key: 'salary', type: 'text', t: true, label: 'Оплата' },
      { key: 'summary', type: 'textarea', t: true, label: 'Короткий опис', max: 400 },
      { key: 'duties', type: 'rich', t: true, label: 'Обовʼязки' },
      { key: 'requirements', type: 'rich', t: true, label: 'Вимоги' },
      { key: 'conditions', type: 'rich', t: true, label: 'Умови' },
    ],
  },
  story: {
    label: 'Історії працівників', single: 'історію', perm: 'content', reorder: true,
    fields: [
      { key: 'name', type: 'text', t: true, label: 'Імʼя', required: true },
      { key: 'position', type: 'text', t: true, label: 'Шлях (напр. «Офіціант → керуючий рестораном»)' },
      { key: 'text', type: 'textarea', t: true, label: 'Історія / відгук', max: 1200 },
      { key: 'photo', type: 'image', label: 'Фото' },
    ],
  },
};
for (const t of Object.values(TYPES)) if (!t.groups) t.groups = [{ label: 'Основне', fields: t.fields }];
for (const t of Object.values(TYPES)) t.allFields = t.groups.flatMap((g) => g.fields);

// ---------------- normalisation ----------------
let LANGS = ['uk', 'en'];
function setLanguages(codes) { if (Array.isArray(codes) && codes.length) LANGS = codes; }

function normScalar(f, v) {
  switch (f.type) {
    case 'text': return sec.cleanLine(v, f.max || 300);
    case 'textarea': return sec.cleanText(v, f.max || 3000);
    case 'rich': return sec.sanitizeRich(String(v || '').slice(0, 50000));
    case 'url': return sec.safeUrl(sec.cleanLine(v, 1000));
    case 'email': { const s = sec.cleanLine(v, 200); return sec.isEmail(s) ? s : ''; }
    case 'phone': return sec.cleanLine(v, 40).replace(/[^\d+()\s-]/g, '');
    case 'number': { const n = Number(v); return Number.isFinite(n) ? n : null; }
    case 'date': return /^\d{4}-\d{2}-\d{2}$/.test(String(v || '')) ? v : '';
    case 'select': { const ok = f.options.some((o) => o.v === v); return ok ? v : (f.default ?? f.options[0].v); }
    case 'toggle': return v === true || v === 'true' || v === 1 || v === '1' || v === 'on';
    case 'image': case 'video': case 'entry': { const n = parseInt(v, 10); return Number.isInteger(n) && n > 0 ? n : null; }
    case 'images': case 'entries': return (Array.isArray(v) ? v : []).map((x) => parseInt(x, 10)).filter((n) => Number.isInteger(n) && n > 0).slice(0, 200);
    case 'list': return (Array.isArray(v) ? v : []).map((x) => sec.cleanLine(x, 80)).filter(Boolean).slice(0, 20);
    case 'latlng': {
      const lat = Number(v?.lat), lng = Number(v?.lng);
      return (Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180) ? { lat: +lat.toFixed(6), lng: +lng.toFixed(6) } : null;
    }
    case 'items': return (Array.isArray(v) ? v : []).slice(0, 100).map((it) => normalize(f.fields, it || {}));
    default: return null;
  }
}
function normalize(fields, input) {
  const out = {};
  input = input && typeof input === 'object' ? input : {};
  for (const f of fields) {
    const v = input[f.key];
    if (f.t) {
      const o = {};
      for (const l of LANGS) o[l] = normScalar(f, v && typeof v === 'object' ? v[l] : (l === LANGS[0] ? v : ''));
      out[f.key] = o;
    } else {
      out[f.key] = v === undefined && f.default !== undefined ? f.default : normScalar(f, v);
    }
  }
  return out;
}
function normalizeBlocks(blocks) {
  return (Array.isArray(blocks) ? blocks : []).slice(0, 80).filter((b) => b && BLOCKS[b.type]).map((b) => ({
    id: /^[a-z0-9]{4,16}$/i.test(b.id || '') ? b.id : Math.random().toString(36).slice(2, 10),
    type: b.type,
    hidden: !!b.hidden,
    data: normalize(BLOCKS[b.type].fields, b.data),
  }));
}
function normalizeEntry(type, input) {
  const def = TYPES[type];
  const data = normalize(def.allFields, input);
  if (def.blocks) data.blocks = normalizeBlocks(input?.blocks);
  return data;
}
function validateEntry(type, data) {
  const def = TYPES[type];
  const errors = [];
  for (const f of def.allFields) {
    if (!f.required) continue;
    const v = data[f.key];
    const empty = f.t ? !v?.[LANGS[0]] : (v === '' || v == null);
    if (empty) errors.push(`Заповніть поле «${f.label}» (${LANGS[0].toUpperCase()}).`);
  }
  if (type === 'brand' && data.category === 'hotel' && !data.booking_url) {
    errors.push('Для готелю вкажіть посилання на бронювання — це обовʼязкова кнопка «Забронювати».');
  }
  return errors;
}

/** Collect every media id referenced in a data object (used to warn before deleting media). */
function collectMediaIds(obj, acc = new Set(), fields = null) {
  if (!obj || typeof obj !== 'object') return acc;
  const walk = (flds, data) => {
    for (const f of flds) {
      const v = data?.[f.key];
      if (f.type === 'image' || f.type === 'video') { if (v) acc.add(v); }
      else if (f.type === 'images') (v || []).forEach((x) => acc.add(x));
      else if (f.type === 'items') (v || []).forEach((it) => walk(f.fields, it));
    }
  };
  if (fields) walk(fields, obj);
  if (Array.isArray(obj.blocks)) obj.blocks.forEach((b) => BLOCKS[b.type] && walk(BLOCKS[b.type].fields, b.data));
  return acc;
}

/** Plain schema description sent to the admin editor. */
function clientSchema() {
  const strip = (fields) => fields.map(({ key, type, t, label, help, options, fields, of, item, max, default: d, required }) => ({
    key, type, t, label, help, options, of, item, max, default: d, required, ...(fields ? { fields: strip(fields) } : {}),
  }));
  return {
    blocks: Object.fromEntries(Object.entries(BLOCKS).map(([k, b]) => [k, { label: b.label, icon: b.icon, help: b.help, fields: strip(b.fields) }])),
    types: Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, {
      label: t.label, single: t.single, blocks: !!t.blocks, blocksLabel: t.blocksLabel, slug: !!t.slug,
      groups: t.groups.map((g) => ({ label: g.label, fields: strip(g.fields) })),
    }])),
  };
}

module.exports = { BLOCKS, TYPES, CATEGORIES, FORMS, normalize, normalizeBlocks, normalizeEntry, validateEntry, collectMediaIds, clientSchema, setLanguages, getLangs: () => LANGS };
