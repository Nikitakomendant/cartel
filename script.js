/* ============================================
   CARTEL UA — JavaScript
   Apple HIG Principles applied:
   - Purpose-driven interactions
   - Smooth, meaningful motion
   - Accessibility first
   ============================================ */

'use strict';

// === NAV: Scroll state (glassmorphism activation) ===
(function initNav() {
  const nav = document.getElementById('main-nav');
  if (!nav) return;

  const threshold = 60;

  function onScroll() {
    const scrolled = window.scrollY > threshold;
    nav.classList.toggle('scrolled', scrolled);
  }

  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll(); // run on load
})();


// === HAMBURGER MENU ===
(function initMobileMenu() {
  const btn = document.getElementById('hamburger-btn');
  const menu = document.getElementById('mobile-menu');
  if (!btn || !menu) return;

  function openMenu() {
    btn.setAttribute('aria-expanded', 'true');
    menu.classList.add('open');
    menu.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function closeMenu() {
    btn.setAttribute('aria-expanded', 'false');
    menu.classList.remove('open');
    menu.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  btn.addEventListener('click', () => {
    const isOpen = btn.getAttribute('aria-expanded') === 'true';
    isOpen ? closeMenu() : openMenu();
  });

  // Close on link click
  menu.querySelectorAll('a').forEach(link => {
    link.addEventListener('click', closeMenu);
  });

  // Close on Escape (Apple HIG: agency — let people recover)
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeMenu();
  });
})();


// === SCROLL REVEAL (Intersection Observer) ===
(function initReveal() {
  // Elements that don't carry the .reveal class in markup yet — add it + a stagger delay
  const autoTargets = document.querySelectorAll(
    '.venue-card, .stat-item, .event-item, .contact-card, .feature-item, .booking-form, .philosophy-visual, .timeline-card, .beyond-card, .pillar-card, .department-card, .message-form-wrap'
  );
  autoTargets.forEach((el, i) => {
    el.classList.add('reveal');
    // Stagger delay for grid items
    const delay = (i % 4) * 80;
    el.style.transitionDelay = `${delay}ms`;
  });

  // Observe EVERY element with .reveal — both the ones just tagged above and
  // any already hardcoded in a page's markup (restaurant-card, banya-card,
  // gallery-item, package-card, service-card, menu-item, etc.). Previously
  // only the fixed selector list above was observed, so any hardcoded
  // .reveal element elsewhere on the site never got its .visible class and
  // stayed permanently invisible (opacity: 0).
  const targets = document.querySelectorAll('.reveal');

  // Respect reduced motion preference (Apple HIG: Motion accessibility) —
  // show everything immediately instead of animating.
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) {
    targets.forEach(el => el.classList.add('visible'));
    return;
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('visible');
        observer.unobserve(entry.target); // Fire once
      }
    });
  }, {
    rootMargin: '-60px 0px',
    threshold: 0.1
  });

  targets.forEach(el => observer.observe(el));
})();


// === ANIMATED COUNTER (Stats section) ===
(function initCounters() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  const counters = [
    { id: 'stat-venues',  end: 7,     suffix: '' },
    { id: 'stat-years',   end: 18,    suffix: '' },
    { id: 'stat-guests',  end: 500,   suffix: 'K+' },
    { id: 'stat-events',  end: 200,   suffix: '+' },
  ];

  function animateCounter(el, end, suffix, duration = 1600) {
    if (prefersReducedMotion) {
      el.textContent = end + suffix;
      return;
    }

    const startTime = performance.now();

    function tick(now) {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = Math.round(eased * end);
      el.textContent = current + suffix;

      if (progress < 1) requestAnimationFrame(tick);
    }

    requestAnimationFrame(tick);
  }

  const observer = new IntersectionObserver((entries) => {
    entries.forEach(entry => {
      if (!entry.isIntersecting) return;
      const el = entry.target;
      const data = counters.find(c => c.id === el.id);
      if (data) animateCounter(el, data.end, data.suffix);
      observer.unobserve(el);
    });
  }, { threshold: 0.5 });

  counters.forEach(({ id }) => {
    const el = document.getElementById(id);
    if (el) observer.observe(el);
  });
})();


// === BOOKING FORM ===
(function initBookingForm() {
  const form = document.getElementById('booking-form');
  if (!form) return;

  // Set minimum date to today
  const dateInput = document.getElementById('book-date');
  if (dateInput) {
    const today = new Date().toISOString().split('T')[0];
    dateInput.setAttribute('min', today);
  }

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const venue   = document.getElementById('book-venue')?.value;
    const date    = document.getElementById('book-date')?.value;
    const time    = document.getElementById('book-time')?.value;
    const guests  = document.getElementById('book-guests')?.value;
    const name    = document.getElementById('book-name')?.value?.trim();
    const phone   = document.getElementById('book-phone')?.value?.trim();

    // Simple validation
    if (!venue || !date || !time || !guests || !name || !phone) {
      showNotification('Будь ласка, заповніть усі поля', 'error');
      return;
    }

    // Simulate booking confirmation
    const submitBtn = document.getElementById('submit-booking');
    if (submitBtn) {
      submitBtn.textContent = 'Відправляємо...';
      submitBtn.disabled = true;
    }

    setTimeout(() => {
      showNotification(`Дякуємо, ${name}! Ми зв'яжемося з вами для підтвердження.`, 'success');
      form.reset();
      if (submitBtn) {
        submitBtn.textContent = 'Підтвердити бронювання';
        submitBtn.disabled = false;
      }
    }, 1500);
  });
})();


// === CONTACTS: DEPARTMENT MESSAGE FORM ===
(function initMessageForm() {
  const form = document.getElementById('message-form');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();

    const name    = document.getElementById('msg-name')?.value?.trim();
    const phone   = document.getElementById('msg-phone')?.value?.trim();
    const email   = document.getElementById('msg-email')?.value?.trim();
    const dept    = document.getElementById('msg-department')?.value;
    const subject = document.getElementById('msg-subject')?.value?.trim();
    const message = document.getElementById('msg-message')?.value?.trim();

    if (!name || !phone || !dept || !subject || !message) {
      showNotification('Будь ласка, заповніть усі обов\'язкові поля', 'error');
      return;
    }

    const body = [
      `Ім'я: ${name}`,
      `Телефон: ${phone}`,
      email ? `Email: ${email}` : null,
      '',
      message
    ].filter(Boolean).join('\n');

    const mailtoUrl = `mailto:${dept}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;

    showNotification('Відкриваємо ваш поштовий клієнт...', 'success');
    window.location.href = mailtoUrl;
  });
})();


// === NOTIFICATION TOAST ===
function showNotification(message, type = 'success') {
  // Remove any existing toast
  const existing = document.getElementById('toast-notification');
  if (existing) existing.remove();

  const toast = document.createElement('div');
  toast.id = 'toast-notification';
  toast.setAttribute('role', 'status');
  toast.setAttribute('aria-live', 'polite');

  toast.style.cssText = `
    position: fixed;
    bottom: 32px;
    left: 50%;
    transform: translateX(-50%) translateY(20px);
    z-index: 9999;
    background: ${type === 'success' ? '#1c1c1e' : '#3a0000'};
    color: ${type === 'success' ? '#f5f5f7' : '#ff6b6b'};
    border: 1px solid ${type === 'success' ? 'rgba(201,168,76,0.3)' : 'rgba(255,107,107,0.3)'};
    padding: 16px 24px;
    border-radius: 14px;
    font-size: 15px;
    font-family: 'Inter', sans-serif;
    max-width: 420px;
    text-align: center;
    backdrop-filter: blur(20px);
    box-shadow: 0 8px 32px rgba(0,0,0,0.5);
    opacity: 0;
    transition: opacity 300ms ease, transform 300ms cubic-bezier(0.34, 1.56, 0.64, 1);
    line-height: 1.5;
  `;

  toast.textContent = message;
  document.body.appendChild(toast);

  // Animate in
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      toast.style.opacity = '1';
      toast.style.transform = 'translateX(-50%) translateY(0)';
    });
  });

  // Auto-dismiss after 4s
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(-50%) translateY(12px)';
    setTimeout(() => toast.remove(), 350);
  }, 4000);
}


// === SMOOTH SCROLL (for anchors) ===
(function initSmoothScroll() {
  const navHeight = parseInt(getComputedStyle(document.documentElement).getPropertyValue('--nav-height')) || 64;

  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener('click', (e) => {
      const target = document.querySelector(anchor.getAttribute('href'));
      if (!target) return;

      e.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - navHeight - 8;
      window.scrollTo({ top, behavior: 'smooth' });
    });
  });
})();


// === VENUE CARD PARALLAX (subtle) ===
(function initCardTilt() {
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (prefersReducedMotion) return;

  document.querySelectorAll('.venue-card').forEach(card => {
    card.addEventListener('mousemove', (e) => {
      const rect = card.getBoundingClientRect();
      const x = (e.clientX - rect.left) / rect.width - 0.5;
      const y = (e.clientY - rect.top) / rect.height - 0.5;
      card.style.transform = `
        translateY(-6px) 
        scale(1.005) 
        rotateX(${-y * 3}deg) 
        rotateY(${x * 3}deg)
      `;
    });

    card.addEventListener('mouseleave', () => {
      card.style.transform = '';
    });
  });
})();


// === ACTIVE NAV LINK on scroll ===
(function initActiveNav() {
  const sections = ['venues', 'events', 'booking', 'contacts'];
  const links = {};

  sections.forEach(id => {
    links[id] = document.getElementById(`nav-${id}`);
  });

  function updateActive() {
    const scrollY = window.scrollY + 100;
    let activeSection = null;

    sections.forEach(id => {
      const el = document.getElementById(id);
      if (el && el.offsetTop <= scrollY) {
        activeSection = id;
      }
    });

    Object.keys(links).forEach(id => {
      if (!links[id]) return;
      links[id].style.color = id === activeSection
        ? 'var(--color-text-primary)'
        : '';
    });
  }

  window.addEventListener('scroll', updateActive, { passive: true });
})();
