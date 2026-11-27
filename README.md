# CARTEL — статический сайт для Cloudflare Pages

Сайт cartel.ua (UA + EN) в виде чистого HTML / CSS / JS. Сервер Node.js, база и CMS больше не нужны.
Формы работают через Cloudflare Pages Function.

```
public/                   ← то, что публикуется (Build output directory)
  index.html, about.html, brands.html, en/…, brands/<slug>.html …
  static/                 CSS, JS, шрифты, Leaflet, иконки
  media/                  фото (WebP/JPG)
  _redirects              301-редиректы со старых URL (/restaurants → /brands?c=restaurant …)
  _headers                CSP, HSTS и кеш
  sitemap.xml, robots.txt, site.webmanifest, 404.html
functions/api/forms/[form].js   обработка форм: cooperation, contact, apply
```

## Деплой на Cloudflare Pages

Workers & Pages → Create → Pages → Connect to Git → репозиторий `cartel`, ветка `main`:

| Поле | Значение |
|---|---|
| Framework preset | None |
| Build command | *(пусто)* |
| Build output directory | `public` |
| Root directory | *(пусто)* |

Затем подключите домен `cartel.ua` в Custom domains.

## Переменные окружения (Settings → Variables and Secrets)

| Переменная | Обязательно | Описание |
|---|---|---|
| `RESEND_API_KEY` | да (secret) | ключ из resend.com |
| `MAIL_FROM` | да | например `CARTEL <no-reply@cartel.ua>`; домен нужно подтвердить в Resend (DNS-записи) |
| `MAIL_TO_COOPERATION` | нет | получатели заявок на сотрудничество (через запятую) |
| `MAIL_TO_CONTACT` | нет | если задано, все обращения из «Контактів» идут сюда, а не по темам |
| `MAIL_TO_HR` | нет | получатели откликов на вакансии |
| `TURNSTILE_SECRET` | нет | включает проверку Cloudflare Turnstile (см. ниже) |

Без `RESEND_API_KEY` и `MAIL_FROM` формы покажут посетителю «Сервіс тимчасово недоступний».
Получатели по умолчанию (темы обращений, HR) заданы в начале `functions/api/forms/[form].js`: проверьте адреса.

## Как менять контент

Правьте HTML напрямую: тексты, ссылки, картинки лежат в `public/*.html`, `public/en/*.html`, `public/brands/*.html`.
Шапка и футер повторяются в каждом файле, поэтому массовые правки удобно делать поиском с заменой по всей папке.

Старая CMS целиком сохранена в ветке **`legacy-node`**. Если нужно вернуться к редактированию через админку:
поднять её (`npm ci --ignore-scripts && node setup-shim.js && npm start`) и выгрузить статику командой
`node scripts/build-static.js http://127.0.0.1:3000 <папка>`.

## Что изменилось по сравнению с Node-версией

- Нет админки, HR-кабинета, базы заявок и истории версий. Заявки приходят только на email.
- Лимитов на частоту отправки в коде нет. Защита: honeypot, проверка времени заполнения, фильтр спам-слов, опционально Turnstile.
  Рекомендуем добавить правило Rate limiting в Cloudflare (Security → WAF) на `/api/forms/*`.
- Вакансии статичные (HTML-страницы). Сейчас опубликованных вакансий нет, форма принимает «Загальну анкету».
- Банер cookies и аналитика (GA4 / GTM / Meta Pixel) выключены: ID не заданы. Чтобы включить, нужно добавить блок
  `analytics-config` и `analytics.js` в `<head>` (см. `views/layout.njk` в ветке `legacy-node`).

### Turnstile (необязательно)

1. Cloudflare → Turnstile → создать виджет, получить site key и secret.
2. `TURNSTILE_SECRET` добавить в переменные Pages.
3. В HTML каждой формы (`<form data-form …>`) добавить внутрь
   `<div class="cf-turnstile" data-sitekey="SITE_KEY"></div>`: `site.js` сам подгрузит скрипт.
