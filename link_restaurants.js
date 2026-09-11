const fs = require('fs');
const path = require('path');

const restPath = path.join(__dirname, 'restaurants/index.html');
let html = fs.readFileSync(restPath, 'utf8');

// Replace the generic tel links with specific page links
html = html.replace(/<a href="tel:\+380673441099" class="restaurant-card-link" id="link-rest-cartel">Забронювати →<\/a>/, '<a href="osteria-italiana/index.html" class="restaurant-card-link">Детальніше →</a>');
html = html.replace(/<a href="tel:\+380503441099" class="restaurant-card-link" id="link-rest-lafamiglia">Забронювати →<\/a>/, '<a href="lucky-bull/index.html" class="restaurant-card-link">Детальніше →</a>');
html = html.replace(/<a href="tel:\+380673441099" class="restaurant-card-link" id="link-rest-salvador">Забронювати →<\/a>/, '<a href="salo/index.html" class="restaurant-card-link">Детальніше →</a>');
html = html.replace(/<a href="tel:\+380503441099" class="restaurant-card-link" id="link-rest-kolyba">Забронювати →<\/a>/, '<a href="kolyba/index.html" class="restaurant-card-link">Детальніше →</a>');

fs.writeFileSync(restPath, html);
