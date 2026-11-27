'use strict';
/**
 * Applies the photo set from seed-assets/photos.json to the content:
 * brand heroes and galleries, page blocks (Hero, Text + photo, CTA, cards),
 * investment projects and the default social image.
 * Used by the seed (new installs) and by scripts/replace-photos.js (live sites).
 * Both the draft and the published version are updated; other unpublished edits stay as they are.
 */
const fs = require('fs');
const path = require('path');
const config = require('./config');
const { db, j, now, addRevision, getSetting, setSetting, entries } = require('./db');
const media = require('./media');

const DIR = path.join(config.ROOT, 'seed-assets');

function loadManifest() {
  return JSON.parse(fs.readFileSync(path.join(DIR, 'photos.json'), 'utf8'));
}

async function applyPhotos({ userId = null, log = () => {} } = {}) {
  const manifest = loadManifest();
  const cache = new Map();
  async function mediaFor(pexelsId, alt) {
    if (!pexelsId) return null;
    if (cache.has(pexelsId)) return cache.get(pexelsId);
    const file = path.join(DIR, 'photos', `${pexelsId}.jpg`);
    if (!fs.existsSync(file)) { log(`missing file for ${pexelsId}`); return null; }
    const id = await media.saveImage(fs.readFileSync(file), `pexels-${pexelsId}.jpg`, userId);
    if (alt) db.prepare('UPDATE media SET alt=? WHERE id=?').run(j(alt), id);
    cache.set(pexelsId, id);
    return id;
  }
  /** Run `mutate` on both draft and published copies of an entry and store them. */
  function update(entry, mutate, label) {
    const data = mutate(entry.data);
    const live = entry.live ? mutate(entry.live) : null;
    db.prepare('UPDATE entries SET data=?, live=?, updated_at=?, updated_by=? WHERE id=?').run(j(data), live ? j(live) : null, now(), userId, entry.id);
    addRevision('entry', entry.id, 'save', data, userId);
    log(`updated ${label}`);
  }
  const clone = (o) => JSON.parse(JSON.stringify(o));

  // brands
  for (const [slug, set] of Object.entries(manifest.brands || {})) {
    const e = entries.bySlug('brand', slug);
    if (!e) { log(`brand not found: ${slug}`); continue; }
    const alt = e.data.name || null;
    const hero = await mediaFor(set.hero, alt);
    const gallery = [];
    for (const g of set.gallery || []) { const m = await mediaFor(g, alt); if (m) gallery.push(m); }
    update(e, (d) => ({ ...clone(d), hero, card: null, gallery, show_gallery: true }), `brand ${slug}`);
  }

  // pages
  for (const [slug, set] of Object.entries(manifest.pages || {})) {
    const e = entries.bySlug('page', slug);
    if (!e) { log(`page not found: ${slug}`); continue; }
    const ids = {
      hero: await mediaFor(set.hero),
      text_image: [], cards: [],
      cta: await mediaFor(set.cta),
    };
    for (const x of set.text_image || []) ids.text_image.push(await mediaFor(x));
    for (const x of set.cards || []) ids.cards.push(await mediaFor(x));
    update(e, (d) => {
      const c = clone(d);
      let ti = 0; let heroDone = false; let ctaDone = false; let cardsDone = false;
      for (const b of c.blocks || []) {
        if (b.type === 'hero' && !heroDone && ids.hero) { b.data.image = ids.hero; heroDone = true; }
        else if (b.type === 'text_image' && ids.text_image[ti] !== undefined) { if (ids.text_image[ti]) b.data.image = ids.text_image[ti]; ti++; }
        else if (b.type === 'cta' && !ctaDone && ids.cta) { b.data.image = ids.cta; ctaDone = true; }
        else if (b.type === 'cards' && !cardsDone && ids.cards.length) {
          (b.data.items || []).forEach((it, i) => { if (ids.cards[i]) it.image = ids.cards[i]; });
          cardsDone = true;
        }
      }
      return c;
    }, `page ${slug}`);
    if (slug === 'home' && ids.hero) {
      const seo = getSetting('seo', {}) || {};
      setSetting('seo', { ...seo, default_image: ids.hero }, userId);
    }
  }

  // investment projects
  for (const [slug, pid] of Object.entries(manifest.projects || {})) {
    const e = entries.bySlug('project', slug);
    if (!e) { log(`project not found: ${slug}`); continue; }
    const img = await mediaFor(pid, e.data.title || null);
    update(e, (d) => ({ ...clone(d), image: img }), `project ${slug}`);
  }
  return { photos: cache.size };
}

module.exports = { applyPhotos, loadManifest };
