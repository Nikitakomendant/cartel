const fs = require('fs');
const path = require('path');

const targetDir = __dirname;

const pagesToCreate = [
  // Main sections
  { path: 'about/index.html', title: 'Про нас', hero: 'Про нас' },
  { path: 'hotels/index.html', title: 'Готелі', hero: 'Наші готелі' },
  { path: 'team/index.html', title: 'Команда', hero: 'Наша команда' },
  { path: 'vacancies/index.html', title: 'Вакансії', hero: 'Вакансії' },
  { path: 'blog/index.html', title: 'Блог', hero: 'Блог' },

  // Restaurants
  { path: 'restaurants/osteria-italiana/index.html', title: 'Osteria Italiana', hero: 'Osteria Italiana' },
  { path: 'restaurants/lucky-bull/index.html', title: 'Lucky Bull', hero: 'Lucky Bull' },
  { path: 'restaurants/salo/index.html', title: 'Salo', hero: 'Ресторація Salo' },
  { path: 'restaurants/filvarok/index.html', title: 'Filvarok', hero: 'Фільварок' },
  { path: 'restaurants/rebra-bbq/index.html', title: 'Rebra BBQ', hero: 'Rebra BBQ' },
  { path: 'restaurants/kolyba/index.html', title: 'Kolyba', hero: 'Колиба' },
  { path: 'restaurants/buka/index.html', title: 'Buka', hero: 'Buka' },

  // Hotels
  { path: 'hotels/buka-apart-hotel/index.html', title: 'BUKA Apart-Hotel', hero: 'BUKA Apart-Hotel' },
  { path: 'hotels/mountain-residence/index.html', title: 'Mountain Residence', hero: 'Mountain Residence' },
];

const templateHTML = (title, hero, depth) => `<!DOCTYPE html>
<html lang="uk" dir="ltr">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title} — Cartel</title>
  <link rel="preconnect" href="https://fonts.googleapis.com">
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&family=Playfair+Display:ital,wght@0,400;0,700;1,400&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="${depth}styles.css">
</head>
<body>
  <!-- Navigation -->
  <nav class="nav" id="main-nav" role="navigation" aria-label="Головне меню">
    <div class="nav-inner">
      <a href="${depth}index.html" class="nav-logo" aria-label="Cartel — на головну">
        <span class="logo-text">CARTEL</span>
      </a>
      <ul class="nav-links" role="list">
        <li><a href="${depth}about/index.html" class="nav-link">ПРО НАС</a></li>
        <li><a href="${depth}restaurants/index.html" class="nav-link">РЕСТОРАНИ</a></li>
        <li><a href="${depth}hotels/index.html" class="nav-link">ГОТЕЛІ</a></li>
        <li><a href="${depth}spa/index.html" class="nav-link">SPA</a></li>
        <li><a href="${depth}team/index.html" class="nav-link">КОМАНДА</a></li>
        <li><a href="${depth}vacancies/index.html" class="nav-link">ВАКАНСІЇ</a></li>
        <li><a href="${depth}blog/index.html" class="nav-link">БЛОГ</a></li>
        <li><a href="${depth}contacts/index.html" class="nav-link">КОНТАКТИ</a></li>
        <li><a href="#" class="nav-link" style="color: var(--color-accent);">UA</a> <span style="color:var(--color-text-tertiary)">|</span> <a href="#" class="nav-link">EN</a></li>
      </ul>
      <div class="nav-actions">
        <a href="tel:+380577000000" class="nav-cta" id="nav-book-btn">Забронювати</a>
        <button class="hamburger" id="hamburger-btn" aria-label="Відкрити меню" aria-expanded="false">
          <span></span><span></span><span></span>
        </button>
      </div>
    </div>
  </nav>
  <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
    <ul role="list">
      <li><a href="${depth}about/index.html" class="mobile-nav-link">ПРО НАС</a></li>
      <li><a href="${depth}restaurants/index.html" class="mobile-nav-link">РЕСТОРАНИ</a></li>
      <li><a href="${depth}hotels/index.html" class="mobile-nav-link">ГОТЕЛІ</a></li>
      <li><a href="${depth}spa/index.html" class="mobile-nav-link">SPA</a></li>
      <li><a href="${depth}team/index.html" class="mobile-nav-link">КОМАНДА</a></li>
      <li><a href="${depth}vacancies/index.html" class="mobile-nav-link">ВАКАНСІЇ</a></li>
      <li><a href="${depth}blog/index.html" class="mobile-nav-link">БЛОГ</a></li>
      <li><a href="${depth}contacts/index.html" class="mobile-nav-link">КОНТАКТИ</a></li>
      <li><a href="#" class="mobile-nav-link" style="display:inline-block; margin-right: 10px;">UA</a> <a href="#" class="mobile-nav-link" style="display:inline-block; color:var(--color-text-tertiary)">EN</a></li>
    </ul>
  </div>

  <main>
    <section class="page-hero">
      <div class="page-hero-bg" style="background: linear-gradient(135deg, #111, #000);"></div>
      <div class="page-hero-content" style="padding-top: 150px; padding-bottom: 50px;">
        <h1 class="page-hero-title">${hero}</h1>
      </div>
    </section>
    <section class="container" style="padding: 100px 20px; min-height: 50vh;">
      <p style="color: var(--color-text-secondary)">Сторінка в процесі наповнення...</p>
    </section>
  </main>
  <script src="${depth}script.js"></script>
</body>
</html>`;

for (const page of pagesToCreate) {
  const fullPath = path.join(targetDir, page.path);
  const dir = path.dirname(fullPath);
  
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const depthCount = page.path.split('/').length - 1;
  const depth = depthCount > 0 ? '../'.repeat(depthCount) : '';

  fs.writeFileSync(fullPath, templateHTML(page.title, page.hero, depth));
  console.log('Created ' + fullPath);
}
