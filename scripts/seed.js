'use strict';
/** Fills an empty database with the initial content (also runs automatically on first start). */
require('../src/seed').ensureSeed().then(() => { console.log('seed ok'); process.exit(0); });
