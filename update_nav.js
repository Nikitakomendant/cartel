const fs = require('fs');
const path = require('path');

const targetDir = __dirname;
const newNavLinks = `
      <ul class="nav-links" role="list">
        <li><a href="{DEPTH}about/index.html" class="nav-link">ПРО НАС</a></li>
        <li><a href="{DEPTH}restaurants/index.html" class="nav-link">РЕСТОРАНИ</a></li>
        <li><a href="{DEPTH}hotels/index.html" class="nav-link">ГОТЕЛІ</a></li>
        <li><a href="{DEPTH}spa/index.html" class="nav-link">SPA</a></li>
        <li><a href="{DEPTH}team/index.html" class="nav-link">КОМАНДА</a></li>
        <li><a href="{DEPTH}vacancies/index.html" class="nav-link">ВАКАНСІЇ</a></li>
        <li><a href="{DEPTH}blog/index.html" class="nav-link">БЛОГ</a></li>
        <li><a href="{DEPTH}contacts/index.html" class="nav-link">КОНТАКТИ</a></li>
        <li><a href="#" class="nav-link" style="color: var(--color-accent);">UA</a> <span style="color:var(--color-text-tertiary)">|</span> <a href="#" class="nav-link">EN</a></li>
      </ul>
`.trim();

const newMobileNav = `
  <div class="mobile-menu" id="mobile-menu" aria-hidden="true">
    <ul role="list">
      <li><a href="{DEPTH}about/index.html" class="mobile-nav-link">ПРО НАС</a></li>
      <li><a href="{DEPTH}restaurants/index.html" class="mobile-nav-link">РЕСТОРАНИ</a></li>
      <li><a href="{DEPTH}hotels/index.html" class="mobile-nav-link">ГОТЕЛІ</a></li>
      <li><a href="{DEPTH}spa/index.html" class="mobile-nav-link">SPA</a></li>
      <li><a href="{DEPTH}team/index.html" class="mobile-nav-link">КОМАНДА</a></li>
      <li><a href="{DEPTH}vacancies/index.html" class="mobile-nav-link">ВАКАНСІЇ</a></li>
      <li><a href="{DEPTH}blog/index.html" class="mobile-nav-link">БЛОГ</a></li>
      <li><a href="{DEPTH}contacts/index.html" class="mobile-nav-link">КОНТАКТИ</a></li>
      <li><a href="#" class="mobile-nav-link" style="display:inline-block; margin-right: 10px;">UA</a> <a href="#" class="mobile-nav-link" style="display:inline-block; color:var(--color-text-tertiary)">EN</a></li>
    </ul>
  </div>
`.trim();

function getDepth(fileDir) {
  if (fileDir === targetDir) return '';
  const relativePath = path.relative(targetDir, fileDir);
  const depthCount = relativePath.split(path.sep).length;
  return '../'.repeat(depthCount);
}

function processDir(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stat = fs.statSync(fullPath);
    if (stat.isDirectory()) {
      if (!file.startsWith('.') && file !== 'node_modules') {
        processDir(fullPath);
      }
    } else if (file.endsWith('.html')) {
      let content = fs.readFileSync(fullPath, 'utf8');
      
      const depth = getDepth(dir);
      const replacedNav = newNavLinks.replace(/{DEPTH}/g, depth);
      const replacedMobile = newMobileNav.replace(/{DEPTH}/g, depth);

      // Replace desktop nav
      content = content.replace(/<ul class="nav-links" role="list">[\s\S]*?<\/ul>/, replacedNav);
      
      // Replace mobile nav
      content = content.replace(/<div class="mobile-menu" id="mobile-menu" aria-hidden="true">[\s\S]*?<\/div>/, replacedMobile);
      
      // Link home logo
      content = content.replace(/<a href="(#|\.\.\/index\.html|index\.html)" class="nav-logo"/, `<a href="${depth}index.html" class="nav-logo"`);
      
      fs.writeFileSync(fullPath, content);
      console.log('Updated ' + fullPath);
    }
  }
}

processDir(targetDir);
