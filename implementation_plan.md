# Redesign Cartel.ua as Multi-Page Site

The objective is to refactor the initial single-page prototype into a full multi-page website that precisely mirrors the structure of the real `cartel.ua` while maintaining the Apple Design Skill aesthetic (cinematic dark mode, gold accents, premium feel).

## Open Questions
> [!IMPORTANT]
> The real text content (like venue descriptions) on cartel.ua is heavily obfuscated by their WordPress theme and custom scripts. While I will migrate all existing pages, links, and photos I can find, some detailed text might be stubbed until we finalize the layout. Is it acceptable if I use placeholder text for some paragraphs while keeping the exact structure, real venue names, and images?

## Proposed Changes

We will create a structured directory mirroring the real site's routing and split our monolithic code into a scalable format.

### Root Directory
#### [MODIFY] [index.html](file:///C:/Users/User/Desktop/cartel-redesign/index.html)
Will be updated to serve purely as the Homepage, linking out to the subpages.
#### [MODIFY] [styles.css](file:///C:/Users/User/Desktop/cartel-redesign/styles.css)
Will be updated with global styles, reusable components (cards, grids, buttons), and navigation rules that all subpages can use.
#### [MODIFY] [script.js](file:///C:/Users/User/Desktop/cartel-redesign/script.js)
Will be updated to handle global logic (like mobile menu toggle, smooth scrolling).

### Subpages
We will create dedicated directories and `index.html` files for every section that exists on cartel.ua. Each page will feature the global navigation menu, a unique cinematic hero section, and a grid of related venues/services.

#### [NEW] [restaurants/index.html](file:///C:/Users/User/Desktop/cartel-redesign/restaurants/index.html)
Page listing all Cartel restaurants with their respective images.
#### [NEW] [voda-club/index.html](file:///C:/Users/User/Desktop/cartel-redesign/voda-club/index.html)
Dedicated page for VODA Club information and photos.
#### [NEW] [spa/index.html](file:///C:/Users/User/Desktop/cartel-redesign/spa/index.html)
Dedicated page for SPA complex details.
#### [NEW] [banya/index.html](file:///C:/Users/User/Desktop/cartel-redesign/banya/index.html)
Dedicated page for "Банька на дровах".
#### [NEW] [fast-food/index.html](file:///C:/Users/User/Desktop/cartel-redesign/fast-food/index.html)
Listing of all fast-food locations.
#### [NEW] [contacts/index.html](file:///C:/Users/User/Desktop/cartel-redesign/contacts/index.html)
Global contact page with maps, phone numbers, and social links.

## Verification Plan
1. **Local Browsing:** I will use a local dev server to click through the navigation menu and ensure all links (`/restaurants/`, `/voda-club/`, etc.) correctly resolve to the new pages.
2. **Visual Consistency:** I will verify that the Apple Design aesthetic (black/gold, smooth animations) applies correctly across all pages using the shared `styles.css`.
3. **Data Verification:** I will extract real photo URLs from the Cartel site (like partner logos and hero backgrounds) to ensure the design feels authentic.
