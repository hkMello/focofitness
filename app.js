(() => {
  'use strict';

  const API_BASE = '/api';
  const SITE = window.SITE || {};
  const WA_NUMBER = String(SITE.whatsapp || '').replace(/\D/g, ''); // só dígitos
  const WA_BASE = WA_NUMBER ? `https://wa.me/${WA_NUMBER}` : 'https://wa.me/';
  const STORE_NAME = SITE.storeName || 'Foco Fitness & Moda';
  const DEFAULT_SIZES = ['P', 'M', 'G', 'GG'];
  const MAX_QTY = 20;

  const state = { cart: [] };

  const formatBRL = (value) =>
    new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
      .format(value).replace(/ /g, ' ');

  async function apiGet(path) {
    const res = await fetch(`${API_BASE}${path}`, { credentials: 'include' });
    if (!res.ok) throw new Error(`Falha ao buscar ${path}`);
    return res.json();
  }

  const $ = (id) => document.getElementById(id);

  const themeBtn = $('btn-tema');
  function currentTheme() { return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light'; }
  function paintThemeButton() {
    themeBtn.setAttribute('aria-label', currentTheme() === 'dark' ? 'Ativar modo claro' : 'Ativar modo escuro');
  }
  themeBtn.addEventListener('click', () => {
    const next = currentTheme() === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('foco-theme', next); } catch (e) {  }
    paintThemeButton();
  });
  paintThemeButton();

  const helloText = `Olá! Vim pelo site da ${STORE_NAME} e gostaria de mais informações.`;
  document.querySelectorAll('[data-wa="hello"]').forEach((a) => {
    a.href = `${WA_BASE}?text=${encodeURIComponent(helloText)}`;
  });

  const grid = $('product-grid');
  const cardTemplate = $('product-card-template');
  const chips = document.querySelectorAll('.chip');

  function syncChips(category) {
    chips.forEach((chip) => {
      const active = (chip.dataset.category || '') === (category || '');
      chip.classList.toggle('is-active', active);
      chip.setAttribute('aria-pressed', String(active));
    });
  }

  function renderProducts(items) {
    grid.innerHTML = '';

    if (!items || items.length === 0) {
      const empty = document.createElement('p');
      empty.className = 'grid-status';
      empty.textContent = 'Nenhuma peça nessa categoria no momento.';
      grid.appendChild(empty);
      return;
    }

    for (const item of items) {
      const node = cardTemplate.content.cloneNode(true);
      const link = node.querySelector('.product-link');
      const img = node.querySelector('.product-thumb');
      const name = node.querySelector('.product-name');
      const price = node.querySelector('.product-price');
      const note = node.querySelector('.product-note');
      const badge = node.querySelector('.product-badge');
      const sizesEl = node.querySelector('.sizes');
      const hint = node.querySelector('.size-hint');
      const addBtn = node.querySelector('.add-to-cart');

      link.href = `/produto/${encodeURIComponent(item.slug)}`;
      img.src = item.thumbnail || '/img/placeholder.svg';
      img.alt = item.thumbnail_alt || item.name;
      name.textContent = item.name;
      price.textContent = formatBRL(item.retail_price);
      note.textContent = item.note || '';
      if (item.badge) { badge.textContent = item.badge; badge.hidden = false; }

      let selectedSize = null;
      const sizeButtons = [];
      for (const size of (item.sizes && item.sizes.length ? item.sizes : DEFAULT_SIZES)) {
        const b = document.createElement('button');
        b.type = 'button';
        b.className = 'size';
        b.textContent = size;
        b.setAttribute('aria-pressed', 'false');
        b.setAttribute('aria-label', `Tamanho ${size}`);
        b.addEventListener('click', () => {
          selectedSize = size;
          hint.hidden = true;
          sizeButtons.forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
        });
        sizeButtons.push(b);
        sizesEl.appendChild(b);
      }

      addBtn.addEventListener('click', () => {
        if (!selectedSize) {
          hint.hidden = false;
          sizeButtons[0].focus();
          return;
        }
        addToCart(item, selectedSize);
      });

      grid.appendChild(node);
    }
  }

  async function loadProducts(category) {
    syncChips(category);
    grid.innerHTML = '<p class="grid-status">Carregando peças…</p>';
    try {
      const query = category ? `?category=${encodeURIComponent(category)}` : '';
      const data = await apiGet(`/products${query}`);
      renderProducts(data.items);
    } catch {
      grid.innerHTML = '<p class="grid-status">Não foi possível carregar a coleção agora. Tente novamente em instantes.</p>';
    }
  }

  function setCategory(category) {
    const url = new URL(window.location.href);
    if (category) url.searchParams.set('category', category);
    else url.searchParams.delete('category');
    window.history.pushState({}, '', url);
    loadProducts(category);
  }

  chips.forEach((chip) => chip.addEventListener('click', () => setCategory(chip.dataset.category || null)));

  const drawer = $('drawer-carrinho');
  const cartItemsEl = $('cart-items');
  const cartCountEl = $('cart-count');
  const cartTotalEl = $('cart-total');
  const cartEmptyEl = $('cart-empty');
  const checkoutBox = $('cart-checkout');
  const nameInput = $('cust-name');
  const notesInput = $('cust-notes');
  const checkoutMsg = $('checkout-msg');
  const waCheckout = $('btn-whatsapp-checkout');

  function addToCart(item, size) {
    const key = `${item.id}:${size}`;
    const existing = state.cart.find((c) => c.key === key);
    if (existing) existing.qty = Math.min(MAX_QTY, existing.qty + 1);
    else state.cart.push({ key, id: item.id, name: item.name, size, price: item.retail_price, qty: 1 });
    renderCart();
    openDrawer();
  }

  function changeQty(key, delta) {
    const line = state.cart.find((c) => c.key === key);
    if (!line) return;
    line.qty = Math.max(1, Math.min(MAX_QTY, line.qty + delta));
    renderCart();
  }

  function removeLine(key) {
    state.cart = state.cart.filter((c) => c.key !== key);
    renderCart();
  }

  function cartTotal() { return state.cart.reduce((sum, l) => sum + l.price * l.qty, 0); }

  function renderCart() {
    cartItemsEl.innerHTML = '';
    let count = 0;

    for (const line of state.cart) {
      count += line.qty;

      const li = document.createElement('li');
      li.className = 'cart-line';

      const info = document.createElement('div');
      const nameEl = document.createElement('p');
      nameEl.className = 'cart-line-name';
      nameEl.textContent = line.name;
      const meta = document.createElement('p');
      meta.className = 'cart-line-meta';
      meta.textContent = `Tam. ${line.size} · ${formatBRL(line.price)}`;
      info.append(nameEl, meta);

      const total = document.createElement('p');
      total.className = 'cart-line-total';
      total.textContent = formatBRL(line.price * line.qty);

      const actions = document.createElement('div');
      actions.className = 'cart-line-actions';

      const qty = document.createElement('div');
      qty.className = 'qty';
      const minus = document.createElement('button');
      minus.type = 'button'; minus.textContent = '−';
      minus.setAttribute('aria-label', `Diminuir quantidade de ${line.name}, tamanho ${line.size}`);
      minus.addEventListener('click', () => changeQty(line.key, -1));
      const qtyNum = document.createElement('span');
      qtyNum.textContent = String(line.qty);
      const plus = document.createElement('button');
      plus.type = 'button'; plus.textContent = '+';
      plus.setAttribute('aria-label', `Aumentar quantidade de ${line.name}, tamanho ${line.size}`);
      plus.addEventListener('click', () => changeQty(line.key, 1));
      qty.append(minus, qtyNum, plus);

      const remove = document.createElement('button');
      remove.type = 'button'; remove.className = 'cart-remove'; remove.textContent = 'Remover';
      remove.setAttribute('aria-label', `Remover ${line.name}, tamanho ${line.size}`);
      remove.addEventListener('click', () => removeLine(line.key));

      actions.append(qty, remove);
      li.append(info, total, actions);
      cartItemsEl.appendChild(li);
    }

    const isEmpty = state.cart.length === 0;
    cartEmptyEl.hidden = !isEmpty;
    checkoutBox.hidden = isEmpty;
    cartCountEl.textContent = String(count);
    cartTotalEl.textContent = formatBRL(cartTotal());
    updateWhatsAppLink();
  }

  function clean(text, max) {
    return String(text || '').replace(/\s+/g, ' ').trim().slice(0, max);
  }

  function buildOrderMessage() {
    const customer = clean(nameInput.value, 60);
    const notes = clean(notesInput.value, 300);
    const delivery = (document.querySelector('input[name="delivery"]:checked') || {}).value || 'Retirar na loja';
    const when = new Date().toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).replace(', ', ' às ');

    const lines = [];
    lines.push(`*NOVO PEDIDO — ${STORE_NAME}*`);
    lines.push('');
    lines.push(`*Cliente:* ${customer || '(informe seu nome)'}`);
    lines.push(`*Recebimento:* ${delivery}`);
    lines.push('');
    lines.push('*Itens do pedido*');
    state.cart.forEach((l, i) => {
      lines.push(`${i + 1}) ${l.name}`);
      lines.push(`    Tam. ${l.size} · ${l.qty} x ${formatBRL(l.price)} = ${formatBRL(l.price * l.qty)}`);
    });
    lines.push('');
    const pieces = state.cart.reduce((s, l) => s + l.qty, 0);
    lines.push(`*Total de peças:* ${pieces}`);
    lines.push(`*Total do pedido:* ${formatBRL(cartTotal())}`);
    lines.push('_Frete e prazo a combinar._');
    if (notes) { lines.push(''); lines.push(`*Observações:* ${notes}`); }
    lines.push('');
    lines.push(`Pedido feito pelo site em ${when}.`);
    return lines.join('\n');
  }

  function updateWhatsAppLink() {
    if (state.cart.length === 0) { waCheckout.href = WA_BASE; return; }
    waCheckout.href = `${WA_BASE}?text=${encodeURIComponent(buildOrderMessage())}`;
  }

  nameInput.addEventListener('input', () => { checkoutMsg.hidden = true; updateWhatsAppLink(); });
  notesInput.addEventListener('input', updateWhatsAppLink);
  document.querySelectorAll('input[name="delivery"]').forEach((r) => r.addEventListener('change', updateWhatsAppLink));
  $('checkout-form').addEventListener('submit', (e) => e.preventDefault());

  waCheckout.addEventListener('click', (e) => {
    checkoutMsg.hidden = true;
    if (state.cart.length === 0) { e.preventDefault(); return; }
    if (!clean(nameInput.value, 60)) {
      e.preventDefault();
      checkoutMsg.textContent = 'Informe seu nome para continuar.';
      checkoutMsg.hidden = false;
      nameInput.focus();
      return;
    }
    updateWhatsAppLink(); // garante que o link reflete o estado atual
  });

  let lastFocus = null;

  function focusables() {
    return drawer.querySelectorAll('a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])');
  }
  function openDrawer() {
    lastFocus = document.activeElement;
    drawer.hidden = false;
    document.body.classList.add('no-scroll');
    $('btn-fechar-carrinho').focus();
  }
  function closeDrawer() {
    drawer.hidden = true;
    document.body.classList.remove('no-scroll');
    (lastFocus && lastFocus.focus ? lastFocus : $('btn-carrinho')).focus();
  }

  $('btn-carrinho').addEventListener('click', openDrawer);
  $('btn-fechar-carrinho').addEventListener('click', closeDrawer);
  drawer.addEventListener('click', (e) => { if (e.target === drawer) closeDrawer(); });
  document.addEventListener('keydown', (e) => {
    if (drawer.hidden) return;
    if (e.key === 'Escape') { closeDrawer(); return; }
    if (e.key === 'Tab') {
      const items = Array.from(focusables()).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    }
  });

  const menuBtn = $('btn-menu');
  const mobileNav = $('mobile-nav');
  function closeMobileNav() { mobileNav.hidden = true; menuBtn.setAttribute('aria-expanded', 'false'); }
  menuBtn.addEventListener('click', () => {
    const open = mobileNav.hidden === false;
    mobileNav.hidden = open;
    menuBtn.setAttribute('aria-expanded', String(!open));
  });

  document.querySelectorAll('[data-nav-category]').forEach((link) => {
    link.addEventListener('click', (e) => {
      e.preventDefault();
      if (!mobileNav.hidden) closeMobileNav();
      $('colecao').scrollIntoView({ behavior: 'smooth', block: 'start' });
      setCategory(link.dataset.navCategory || null);
    });
  });

  $('ano-atual').textContent = new Date().getFullYear();
  renderCart();
  loadProducts(new URLSearchParams(window.location.search).get('category'));
})();
