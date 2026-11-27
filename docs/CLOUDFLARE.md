# Cloudflare: антиддос і захист CARTEL

Cloudflare стоїть перед сервером: фільтрує ботів і DDoS, дає HTTPS і ховає справжню адресу сервера.

## 1. Підключення домену
1. Зареєструйтесь на cloudflare.com, додайте домен (Add a site).
2. У реєстратора домену замініть nameserver-и на ті, що покаже Cloudflare.
3. У DNS додайте записи `@` і `www` (і `admin`, якщо потрібен окремий домен для працівників) на IP сервера з увімкненою помаранчевою хмаркою (Proxied).

## 2. Налаштування в панелі Cloudflare
- SSL/TLS → режим **Full (strict)**; увімкніть Always Use HTTPS.
- Security → Bots: увімкніть Bot Fight Mode.
- Security → WAF → Rate limiting: правило на `/admin/login` (напр. 10 запитів / 10 хв з одного IP).
- Security → Settings: Security Level = Medium; під час атаки тимчасово «I'm Under Attack».
- Turnstile (невидима капча для форм): створіть ключі, `TURNSTILE_SECRET` у `.env`, site key у CMS → Форми й антиспам.

## 3. Налаштування `.env`
Згенерувати файл з випадковим секретом:
```
node scripts/init-env.js cartel.ua admin.cartel.ua
```
Ключове: `BEHIND_CLOUDFLARE=1` (застосунок бачить реальний IP відвідувача, інакше ліміти й блокування діють на всіх разом), `ALLOWED_HOSTS`, `ADMIN_HOST`.
**Важливо:** `BEHIND_CLOUDFLARE=1` вмикайте лише коли порт застосунку недоступний напряму з інтернету (в Docker він слухає лише 127.0.0.1) — інакше хтось зможе підробити IP заголовком.

## 4. Тимчасовий показ через Cloudflare Tunnel
```
cloudflared tunnel --url http://localhost:3000
```
У `.env` поставте `BEHIND_CLOUDFLARE=1`, інакше всі відвідувачі матимуть один IP.

## 5. Для працівників (додатково)
Cloudflare Zero Trust → Access → Applications: закрийте `admin.cartel.ua` входом за поштою ще до форми логіну. Перевірте актуальні умови безкоштовного плану на сайті Cloudflare.

## Бекапи
Щоденний бекап вбудований (`AUTO_BACKUP=1`): файли в `data/backups`, зберігається 14 копій. Раз на тиждень копіюйте цю папку на інший диск або в хмару.
