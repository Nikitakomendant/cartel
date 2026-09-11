const fs = require('fs');

const data = JSON.parse(fs.readFileSync('pages.json', 'utf8'));
const pages = data.map(p => ({
  id: p.id,
  title: p.title.rendered,
  slug: p.slug,
  parent: p.parent,
  link: p.link
}));

// Create a map for fast lookup
const pageMap = {};
pages.forEach(p => {
  p.children = [];
  pageMap[p.id] = p;
});

// Build hierarchy
pages.forEach(p => {
  if (p.parent !== 0 && pageMap[p.parent]) {
    pageMap[p.parent].children.push(p);
  }
});

// Find top-level pages
const rootPages = pages.filter(p => p.parent === 0);

function printTree(page, level = 0) {
  const indent = '  '.repeat(level);
  console.log(`${indent}- ${page.title} (${page.slug})`);
  page.children.forEach(child => printTree(child, level + 1));
}

console.log("== CARTEL PAGES HIERARCHY ==");
rootPages.forEach(p => printTree(p));
