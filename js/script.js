/* =========================================================
   RAMEN HABARU — interactions
   ========================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* ---------- year ---------- */
  var yearEl = $('#year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  /* ---------- sakura petals ---------- */
  var layer = $('#sakuraLayer');
  if (layer) {
    if (reduced) {
      layer.remove();
    } else {
      var COLORS = ['#f7d3dc', '#f3c2cf', '#fbe3e8', '#efb3c3'];
      function spawnPetals() {
        var w = window.innerWidth;
        var count = w < 600 ? 14 : w < 1200 ? 22 : 32;
        layer.innerHTML = '';
        for (var i = 0; i < count; i++) {
          var p = document.createElement('span');
          p.className = 'petal';
          var size = 8 + Math.random() * 16;
          p.style.setProperty('--s', size.toFixed(1) + 'px');
          p.style.setProperty('--o', (0.45 + Math.random() * 0.5).toFixed(2));
          p.style.setProperty('--d', (9 + Math.random() * 13).toFixed(1) + 's');
          p.style.setProperty('--delay', (-Math.random() * 18).toFixed(1) + 's');
          p.style.left = (Math.random() * 106 - 4).toFixed(2) + '%';
          p.style.background =
            'radial-gradient(circle at 30% 30%, #fff 0%, ' + COLORS[i % COLORS.length] +
            ' 45%, #e9a8ba 100%)';
          layer.appendChild(p);
        }
      }
      spawnPetals();
      var rz;
      window.addEventListener('resize', function () {
        clearTimeout(rz);
        rz = setTimeout(spawnPetals, 350);
      });
    }
  }

  /* ---------- header, progress, to-top ---------- */
  var header    = $('#header');
  var progress  = $('#scrollProgress');
  var toTop     = $('#toTop');
  var nav       = $('#nav');
  var navLinks  = $$('.nav-link');
  var sections  = navLinks.map(function (a) { return $(a.getAttribute('href')); }).filter(Boolean);
  var ticking   = false;

  function onScroll() {
    var y = window.pageYOffset;
    var docH = document.documentElement.scrollHeight - window.innerHeight;

    header.classList.toggle('is-solid', y > 60);
    if (progress) progress.style.width = (docH > 0 ? (y / docH) * 100 : 0) + '%';
    if (toTop) toTop.classList.toggle('show', y > 700);

    /* active section */
    var current = '';
    sections.forEach(function (sec) {
      if (sec.getBoundingClientRect().top <= window.innerHeight * 0.38) current = sec.id;
    });
    navLinks.forEach(function (a) {
      a.classList.toggle('is-active', a.getAttribute('href') === '#' + current);
    });
    ticking = false;
  }
  window.addEventListener('scroll', function () {
    if (!ticking) { window.requestAnimationFrame(onScroll); ticking = true; }
  }, { passive: true });
  onScroll();

  if (toTop) {
    toTop.addEventListener('click', function () {
      window.scrollTo({ top: 0, behavior: reduced ? 'auto' : 'smooth' });
    });
  }

  /* ---------- mobile nav ---------- */
  var burger = $('#burger');
  if (burger && nav) {
    burger.addEventListener('click', function () {
      var open = nav.classList.toggle('open');
      burger.classList.toggle('is-open', open);
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
      document.body.style.overflow = open ? 'hidden' : '';
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest('a')) {
        nav.classList.remove('open');
        burger.classList.remove('is-open');
        burger.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      }
    });
  }

  /* ---------- reveal on scroll + stagger ---------- */
  var ioFired = false;
  var revealEls = $$('.reveal');
  revealEls.forEach(function (el) {
    var group = el.parentElement;
    if (!el.style.getPropertyValue('--d') && group) {
      var sibs = $$('.reveal', group);
      var i = sibs.indexOf(el);
      if (i > 0) el.style.setProperty('--d', Math.min(i * 0.09, 0.7).toFixed(2) + 's');
    }
  });

  if ('IntersectionObserver' in window && !reduced) {
    var io = new IntersectionObserver(function (entries) {
      ioFired = true;
      entries.forEach(function (en) {
        if (en.isIntersecting) {
          en.target.classList.add('in');
          io.unobserve(en.target);
        }
      });
    }, { threshold: 0.14, rootMargin: '0px 0px -8% 0px' });
    revealEls.forEach(function (el) { io.observe(el); });
  } else {
    revealEls.forEach(function (el) { el.classList.add('in'); });
  }

  /* ---------- counters ---------- */
  function countUp(el) {
    var target = parseInt(el.getAttribute('data-count'), 10) || 0;
    if (reduced) { el.textContent = target; return; }
    var start = null, dur = 1500, done = false;
    function finish() {
      if (done) return;
      done = true;
      el.textContent = target;
    }
    function frame(ts) {
      if (done) return;
      if (start === null) start = ts;
      var p = Math.min((ts - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased);
      if (p < 1) requestAnimationFrame(frame); else finish();
    }
    requestAnimationFrame(frame);
    setTimeout(finish, dur + 800);
  }
  var counters = $$('[data-count]');
  if ('IntersectionObserver' in window) {
    var cio = new IntersectionObserver(function (entries) {
      ioFired = true;
      entries.forEach(function (en) {
        if (en.isIntersecting) { countUp(en.target); cio.unobserve(en.target); }
      });
    }, { threshold: 0.6 });
    counters.forEach(function (el) { cio.observe(el); });
  } else {
    counters.forEach(countUp);
  }

  /* safety net: never leave the page hidden if IO never reports */
  setTimeout(function () {
    if (ioFired) return;
    revealEls.forEach(function (el) { el.classList.add('in'); });
    counters.forEach(function (el) { countUp(el); });
  }, 1500);

  /* ---------- menu filter ---------- */
  var grid = $('#menuGrid');
  var filters = $$('.filter');
  if (grid && filters.length) {
    filters.forEach(function (btn) {
      btn.addEventListener('click', function () {
        filters.forEach(function (b) { b.classList.remove('is-active'); b.setAttribute('aria-selected', 'false'); });
        btn.classList.add('is-active');
        btn.setAttribute('aria-selected', 'true');
        var cat = btn.getAttribute('data-filter');
        $$('.card', grid).forEach(function (card) {
          var show = cat === 'all' || card.getAttribute('data-cat') === cat;
          card.classList.toggle('is-hidden', !show);
          if (show) {
            card.classList.add('in');
            if (!reduced) {
              card.style.animation = 'none';
              void card.offsetWidth;
              card.style.animation = 'cardIn .55s var(--ease) both';
            }
          }
        });
      });
    });
  }

  /* ---------- 3D tilt on menu cards ---------- */
  if (!reduced && window.matchMedia('(hover:hover)').matches) {
    $$('.card').forEach(function (card) {
      card.addEventListener('pointermove', function (e) {
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - 0.5;
        var py = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform =
          'translateY(-10px) perspective(900px) rotateX(' + (-py * 7).toFixed(2) +
          'deg) rotateY(' + (px * 9).toFixed(2) + 'deg) scale(1.015)';
      });
      card.addEventListener('pointerleave', function () { card.style.transform = ''; });
    });
  }

  /* ---------- reviews slider ---------- */
  var track = $('#revTrack');
  var dots  = $('#revDots');
  if (track && dots) {
    var slides = $$('.rev', track);
    var page = 0, timer = null;

    function perPage() {
      var w = window.innerWidth;
      return w < 620 ? 1 : w < 1000 ? 2 : 3;
    }
    function pages() { return Math.max(1, Math.ceil(slides.length / perPage())); }

    function build() {
      var p = pages();
      if (dots.children.length !== p) {
        dots.innerHTML = '';
        for (var i = 0; i < p; i++) {
          var b = document.createElement('button');
          b.setAttribute('aria-label', 'Сторінка ' + (i + 1));
          b.addEventListener('click', function (e) {
            page = dots.children.length ? Array.prototype.indexOf.call(dots.children, e.currentTarget) : 0;
            render(); restart();
          });
          dots.appendChild(b);
        }
      }
      if (page > p - 1) page = p - 1;
      render();
    }
    function render() {
      var p = perPage();
      var gap = parseFloat(getComputedStyle(track).columnGap || getComputedStyle(track).gap) || 0;
      var step = slides[0].getBoundingClientRect().width + gap;
      track.style.transform = 'translateX(' + (-(page * p * step)).toFixed(1) + 'px)';
      Array.prototype.forEach.call(dots.children, function (d, i) {
        d.classList.toggle('on', i === page);
      });
    }
    function next() { page = (page + 1) % pages(); render(); }
    function restart() {
      if (timer) clearInterval(timer);
      if (!reduced) timer = setInterval(next, 5200);
    }

    $('#revNext').addEventListener('click', function () { next(); restart(); });
    $('#revPrev').addEventListener('click', function () {
      page = (page - 1 + pages()) % pages(); render(); restart();
    });

    build();
    restart();
    window.addEventListener('resize', function () { clearTimeout(window.__rzT); window.__rzT = setTimeout(build, 200); });
  }

  /* ---------- reservation form ---------- */
  var form = $('#resForm');
  if (form) {
    var dateEl = $('#fDate');
    if (dateEl) {
      var today = new Date();
      var pad = function (n) { return (n < 10 ? '0' : '') + n; };
      var iso = today.getFullYear() + '-' + pad(today.getMonth() + 1) + '-' + pad(today.getDate());
      dateEl.min = iso;
      if (!dateEl.value) dateEl.value = iso;
    }

    function setErr(id, msg) {
      var input = $('#' + id);
      var box = $('.err[data-for="' + id + '"]');
      if (input) input.classList.toggle('invalid', !!msg);
      if (box) box.textContent = msg || '';
      return !msg;
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var ok = true;
      var name  = $('#fName').value.trim();
      var phone = $('#fPhone').value.trim();
      var date  = $('#fDate').value;
      var time  = $('#fTime').value;
      var g     = parseInt($('#fGuests').value, 10);

      ok = setErr('fName', name.length >= 2 ? '' : 'Вкажіть, будь ласка, ім’я') && ok;
      ok = setErr('fPhone', /^[+\d][\d\s()\-]{7,}$/.test(phone) ? '' : 'Перевірте номер телефону') && ok;
      ok = setErr('fDate', date ? '' : 'Оберіть дату') && ok;
      ok = setErr('fTime', time ? '' : 'Оберіть час') && ok;
      ok = setErr('fGuests', (g >= 1 && g <= 18) ? '' : 'Від 1 до 18 гостей') && ok;

      var okBox = $('#formOk');
      if (!ok) {
        okBox.classList.remove('show');
        form.classList.add('shake');
        setTimeout(function () { form.classList.remove('shake'); }, 600);
        return;
      }

      var base = (form.querySelector('input[name="base"]:checked') || {}).value || '';
      var baseTxt = { shoyu: '醤油 Shoyu', miso: '味噌 Miso', tonkotsu: '豚骨 Tonkotsu', spicy: '辛 Spicy' }[base];

      okBox.innerHTML =
        '✿ Дякуємо, ' + name + '! Стіл на ' + g + ' ос. у «' + date + '» о ' + time +
        ' (база: ' + baseTxt + ') зарезервовано. Ми зателефонуємо на ' + phone + ' протягом 15 хвилин. 一期一会!';
      okBox.classList.add('show');
      form.reset();
      if (dateEl) dateEl.value = date;
    });

    $$('input, select, textarea', form).forEach(function (el) {
      el.addEventListener('input', function () { el.classList.remove('invalid'); });
    });
  }

  /* ---------- smooth anchor offset fix ---------- */
  $$('a[href^="#"]').forEach(function (a) {
    a.addEventListener('click', function (e) {
      var id = a.getAttribute('href');
      if (id.length < 2) return;
      var t = document.querySelector(id);
      if (!t) return;
      e.preventDefault();
      var y = t.getBoundingClientRect().top + window.pageYOffset - 78;
      window.scrollTo({ top: y, behavior: reduced ? 'auto' : 'smooth' });
    });
  });
})();

/* =========================================================
   CART & CHECKOUT — Monobank / Privat24
   ========================================================= */
(function () {
  'use strict';

  var reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var $  = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };

  /* POST /api/pay -> { url } для редіректу на сторінку банку,
     { demo: true } якщо токенів немає. Токени мерчанта живуть лише на бекенді. */
  var PAY = { endpoint: '/api/pay', health: '/api/health' };
  var STORE = 'habaru_cart';
  var PROVIDERS = { mono: 'Монобанк', privat24: 'Приват24' };
  var LOGS = {
    mono: ['Створення рахунку Monobank', 'Перехід на сторінку оплати', 'Підтвердження 3-D Secure', 'Операцію підтверджено'],
    privat24: ['Сесія eCom ПриватБанку', 'Авторизація платіжної карти', 'Підтвердження 3-D Secure', 'Операцію підтверджено']
  };

  var products = $$('.card').map(function (card, i) {
    var art = card.querySelector('.card-art');
    var priceEl = card.querySelector('.price');
    return {
      id: 'p' + (i + 1),
      name: (card.querySelector('h3') || {}).textContent || '',
      jp: (card.querySelector('.jp-name') || {}).textContent || '',
      kanji: (card.querySelector('.kanji') || {}).textContent || '',
      price: parseInt((priceEl ? priceEl.textContent : '0').replace(/\D/g, ''), 10) || 0,
      artClass: art ? art.className.replace(/\bcard-art\b/, '').trim() : '',
      card: card
    };
  });

  var cart = {};
  try { cart = JSON.parse(localStorage.getItem(STORE)) || {}; } catch (e) { cart = {}; }

  var backdrop  = $('#backdrop');
  var panel     = $('#cartPanel');
  var badge     = $('#cartBadge');
  var modal     = $('#payModal');
  var lastFocus = null;

  function save() { try { localStorage.setItem(STORE, JSON.stringify(cart)); } catch (e) {} }
  function qtyOf(id) { return cart[id] || 0; }
  function findProduct(id) {
    for (var i = 0; i < products.length; i++) if (products[i].id === id) return products[i];
    return null;
  }
  function items() { return products.filter(function (p) { return qtyOf(p.id) > 0; }); }
  function total() { return items().reduce(function (s, p) { return s + p.price * qtyOf(p.id); }, 0); }
  function money(n) { return n.toLocaleString('uk-UA') + ' ₴'; }

  function setQty(id, n) {
    n = Math.max(0, Math.min(20, n));
    if (n) cart[id] = n; else delete cart[id];
    save();
    render();
  }

  /* ---------- toast ---------- */
  var toastTimer;
  function toast(html) {
    var t = $('#toast');
    if (!t) return;
    t.innerHTML = html;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 2600);
  }

  /* ---------- render ---------- */
  function render() {
    renderCards();
    renderCart();
    renderBadge();
  }

  function renderCards() {
    products.forEach(function (p) {
      var foot = p.card.querySelector('.card-foot');
      if (!foot) return;
      var q = qtyOf(p.id);
      var key = q > 0 ? 'x' + q : 'add';
      if (foot.getAttribute('data-key') === key) return;
      foot.setAttribute('data-key', key);
      foot.innerHTML = q > 0
        ? '<div class="stepper"><button type="button" data-dec aria-label="Зменшити">−</button><b>' +
          q + '</b><button type="button" data-inc aria-label="Збільшити">＋</button></div>'
        : '<button class="add" type="button">У кошик</button>';
    });
  }

  function renderCart() {
    var box = $('#cartItems');
    if (!box) return;
    var list = items();
    box.innerHTML = list.length
      ? list.map(function (p) {
          var q = qtyOf(p.id);
          return '<div class="cart-item" data-id="' + p.id + '">' +
                   '<div class="ci-kanji ' + p.artClass + '">' + p.kanji + '</div>' +
                   '<div class="ci-info"><b>' + p.name + '</b><i>' + p.jp + '</i></div>' +
                   '<div class="ci-right"><span class="ci-price">' + money(p.price * q) + '</span>' +
                     '<div class="stepper"><button type="button" data-dec aria-label="Зменшити">−</button>' +
                     '<b>' + q + '</b>' +
                     '<button type="button" data-inc aria-label="Збільшити">＋</button></div></div>' +
                 '</div>';
        }).join('')
      : '<div class="cart-empty"><span>碗</span>Кошик поки що порожній<br>Оберіть рамен у меню</div>';

    var sum = total();
    $('#cartTotal').textContent = money(sum);
    $('#checkoutBtn').disabled = !list.length;
  }

  function renderBadge() {
    if (!badge) return;
    var count = items().reduce(function (s, p) { return s + qtyOf(p.id); }, 0);
    badge.hidden = count === 0;
    badge.textContent = count;
    if (count > 0 && !reduced) {
      badge.classList.remove('pop');
      void badge.offsetWidth;
      badge.classList.add('pop');
    }
  }

  /* ---------- cart / modal open-close ---------- */
  function lock(on) { document.body.classList.toggle('locked', on); }

  function openCart() {
    panel.classList.add('open');
    panel.setAttribute('aria-hidden', 'false');
    $('#cartBtn').setAttribute('aria-expanded', 'true');
    backdrop.hidden = false;
    void backdrop.offsetWidth;
    backdrop.classList.add('show');
    lock(true);
    $('#cartClose').focus();
  }
  function closeCart() {
    panel.classList.remove('open');
    panel.setAttribute('aria-hidden', 'true');
    $('#cartBtn').setAttribute('aria-expanded', 'false');
    backdrop.classList.remove('show');
    lock(modal.classList.contains('open'));
    setTimeout(function () {
      if (!backdrop.classList.contains('show')) backdrop.hidden = true;
    }, 450);
  }
  function cartIsOpen() { return panel.classList.contains('open'); }

  function goStep(n) {
    $$('.pay-step', modal).forEach(function (s) {
      s.classList.toggle('is-on', s.getAttribute('data-step') === String(n));
    });
    modal.scrollTop = 0;
    $('.modal-card').scrollTop = 0;
  }

  function renderSummary() {
    var list = items();
    $('#paySummary').innerHTML =
      list.map(function (p) {
        var q = qtyOf(p.id);
        return '<li><span>' + p.name + ' × ' + q + '</span><span>' + money(p.price * q) + '</span></li>';
      }).join('') +
      '<li class="sum"><span>Разом</span><span>' + money(total()) + '</span></li>';
    $('#payTotal').textContent = money(total());
    $('#payErr').textContent = '';
  }

  function openModal() {
    lastFocus = document.activeElement;
    renderSummary();
    syncPM();
    goStep(1);
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    lock(true);
    setTimeout(function () { var f = $('#pName'); if (f) f.focus(); }, 60);
  }
  function closeModal() {
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    lock(cartIsOpen());
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  /* ---------- events: stepper ---------- */
  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!t || !t.closest) return;

    var foot = t.closest('.card-foot');
    if (foot) {
      var card = foot.closest('.card');
      var prod = products.filter(function (p) { return p.card === card; })[0];
      if (!prod) return;
      var q = qtyOf(prod.id);
      if (t.closest('.add')) {
        setQty(prod.id, q + 1);
        var btn = foot.querySelector('.add');
        if (btn && !reduced) { btn.classList.add('pulse'); }
        toast('Додано: <b>' + prod.name + '</b> — ' + money(prod.price));
      } else if (t.closest('[data-inc]')) {
        setQty(prod.id, q + 1);
        bump(foot);
      } else if (t.closest('[data-dec]')) {
        setQty(prod.id, q - 1);
        bump(foot);
      }
      return;
    }

    var ci = t.closest('.cart-item');
    if (ci && (t.closest('[data-inc]') || t.closest('[data-dec]'))) {
      var id = ci.getAttribute('data-id');
      var pq = qtyOf(id);
      if (t.closest('[data-inc]')) setQty(id, pq + 1);
      else if (!pq || pq - 1 <= 0) {
        ci.classList.add('removing');
        setTimeout(function () { setQty(id, pq - 1); }, reduced ? 0 : 260);
      } else setQty(id, pq - 1);
      return;
    }

    if (t.closest('#cartBtn')) { cartIsOpen() ? closeCart() : openCart(); }
    else if (t.closest('#cartClose') || t.closest('#backdrop')) closeCart();
    else if (t.closest('#checkoutBtn')) {
      if (!items().length) return;
      closeCart();
      setTimeout(openModal, reduced ? 0 : 320);
    }
    else if (t.closest('#payClose')) closeModal();
    else if (t.closest('#payDoneBtn')) {
      closeModal();
      toast('Замовлення <b>прийнято</b> · готуємо на кухні');
    }
  });

  function bump(scope) {
    if (reduced) return;
    var b = scope.querySelector('.stepper b');
    if (b) { b.classList.remove('bump'); void b.offsetWidth; b.classList.add('bump'); }
  }

  /* ---------- payment ---------- */
  function setErr(id, msg) {
    var input = $('#' + id);
    var box = $('.err[data-for="' + id + '"]');
    if (input) input.classList.toggle('invalid', !!msg);
    if (box) box.textContent = msg || '';
    return !msg;
  }

  function validate() {
    var name = $('#pName').value.trim();
    var phone = $('#pPhone').value.trim();
    var ok = true;
    ok = setErr('pName', name.length >= 2 ? '' : 'Вкажіть, будь ласка, ім’я') && ok;
    ok = setErr('pPhone', /^[+\d][\d\s()\-]{7,}$/.test(phone) ? '' : 'Перевірте номер телефону') && ok;
    if (!items().length) {
      $('#payErr').textContent = 'Кошик порожній — додайте страви перед оплатою.';
      ok = false;
    } else {
      $('#payErr').textContent = '';
    }
    if (!ok) {
      var card = $('#modalCard');
      card.classList.add('shake');
      setTimeout(function () { card.classList.remove('shake'); }, 600);
    }
    return ok;
  }

  function snapshot(provider) {
    return {
      no: 'HB-' + (1000 + Math.floor(Math.random() * 8999)),
      provider: provider,
      items: items().map(function (p) {
        var q = qtyOf(p.id);
        return { name: p.name, qty: q, price: p.price, sum: p.price * q };
      }),
      total: total(),
      customer: {
        name: $('#pName').value.trim(),
        phone: $('#pPhone').value.trim(),
        address: $('#pAddr').value.trim(),
        note: $('#pNote').value.trim()
      },
      created: new Date()
    };
  }

  function isOffline(err) {
    if (!err) return false;
    if (err.name === 'TypeError') return true;
    return /Failed to fetch|NetworkError|Load failed|ERR_INTERNET|ECONNREFUSED/i.test(err.message || '');
  }

  function createInvoice(order) {
    if (!PAY.endpoint || location.protocol === 'file:') return Promise.resolve(null);
    return fetch(PAY.endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        provider: order.provider,
        amount: order.total * 100,
        currency: 'UAH',
        orderId: order.no,
        description: 'RAMEN HABARU · ' + order.no,
        items: order.items,
        customer: order.customer,
        successUrl: location.href.split('#')[0] + '?paid=' + order.no,
        failUrl: location.href.split('#')[0] + '?failed=' + order.no
      })
    }).then(function (r) {
      return r.json().catch(function () { return { __raw: true }; }).then(function (d) {
        if (d && d.__raw) return null;
        if (d && d.url) return d.url;
        if (d && d.demo === true) return null;
        if (d && d.ok === false) throw new Error(d.error || 'Сервер відхилив запит оплати');
        if (!r.ok) return null;
        return null;
      });
    }).catch(function (err) {
      if (isOffline(err)) return null;
      throw err;
    });
  }

  function fetchHealth() {
    if (!PAY.health || location.protocol === 'file:') return;
    fetch(PAY.health, { cache: 'no-store' })
      .then(function (r) { return r.json(); })
      .then(function (d) { if (d && d.ok) applyHealth(d); })
      .catch(function () {});
  }

  function applyHealth(d) {
    var note = $('#payModeNote');
    if (note) {
      note.textContent = d.mode === 'live'
        ? 'Захищена оплата · платіжний шлюз ' + (d.baseUrl || '')
        : 'Демо-режим · токени не задані — заповніть .env і запустіть node server.js';
    }
    ['mono', 'privat24'].forEach(function (k) {
      var input = document.querySelector('.pm input[value="' + k + '"]');
      if (!input) return;
      var lab = input.closest('.pm');
      var st = lab.querySelector('.pm-state');
      var live = !!(d.providers && d.providers[k]);
      lab.classList.toggle('is-demo', !live);
      lab.classList.toggle('is-live', live);
      if (st) st.textContent = live ? 'live' : 'демо';
    });
  }

  function prepareProvider(provider) {
    var logo = $('#payLogo');
    logo.className = 'pm-logo ' + (provider === 'mono' ? 'lg-mono' : 'lg-p24');
    logo.textContent = provider === 'mono' ? 'mono' : 'P24';
    $('#payBankName').textContent = PROVIDERS[provider];
    $('#paySecure').textContent = provider === 'mono'
      ? 'Monobank Merchant · 3-D Secure'
      : 'Privat24 eCom · 3-D Secure';
    var log = $('#payLog');
    log.innerHTML = (LOGS[provider] || LOGS.mono)
      .map(function (s) { return '<li>' + s + '</li>'; }).join('');
    $('#payBarFill').style.width = '6%';
    return $$('li', log);
  }

  function playLog(lis) {
    var step = reduced ? 90 : 560;
    lis.forEach(function (li, i) {
      setTimeout(function () {
        li.classList.add('on', 'done');
        $('#payBarFill').style.width = Math.round(((i + 1) / lis.length) * 100) + '%';
      }, step * (i + 1));
    });
    return step * (lis.length + 1) + (reduced ? 60 : 420);
  }

  function showReceipt(order) {
    var when = order.created.toLocaleTimeString('uk-UA', { hour: '2-digit', minute: '2-digit' });
    var positions = order.items.reduce(function (s, it) { return s + it.qty; }, 0);
    $('#receipt').innerHTML =
      '<div><span>Замовлення</span><span>' + order.no + '</span></div>' +
      '<div><span>Час</span><span>' + when + '</span></div>' +
      '<div><span>Позицій</span><span>' + positions + '</span></div>' +
      '<div><span>Спосіб оплати</span><span>' + PROVIDERS[order.provider] + '</span></div>' +
      '<div><span>Одержувач</span><span>' + order.customer.name + '</span></div>' +
      '<div><span>Контакт</span><span>' + order.customer.phone + '</span></div>' +
      '<div class="total"><span>Сплачено</span><span>' + money(order.total) + '</span></div>';
    $('#payDoneTxt').textContent =
      'Дякуємо, ' + order.customer.name + '! Рамен уже пішов на кухню. ' +
      'Підтвердження надіслано на ' + order.customer.phone + '.';
  }

  function pay() {
    var provider = (document.querySelector('input[name="pm"]:checked') || {}).value || 'mono';
    var order = snapshot(provider);
    goStep(2);
    var lis = prepareProvider(provider);

    createInvoice(order).then(function (url) {
      if (url) { window.location.href = url; return; }
      return new Promise(function (res) { setTimeout(res, playLog(lis)); })
        .then(function () {
          showReceipt(order);
          cart = {};
          save();
          render();
          goStep(3);
        });
    }).catch(function (err) {
      goStep(1);
      $('#payErr').textContent = err && err.message ? err.message : 'Оплату не вдалося завершити.';
    });
  }

  $('#payForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (!validate()) return;
    var btn = $('#payBtn');
    btn.disabled = true;
    pay();
    setTimeout(function () { btn.disabled = false; }, 1200);
  });

  function syncPM() {
    $$('.pm').forEach(function (l) {
      var i = l.querySelector('input');
      l.classList.toggle('is-on', !!(i && i.checked));
    });
  }
  $$('.pm input').forEach(function (i) { i.addEventListener('change', syncPM); });
  syncPM();

  /* ---------- overlay / keys ---------- */
  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    if (modal.classList.contains('open')) closeModal();
    else if (cartIsOpen()) closeCart();
  });

  fetchHealth();

  try {
    var qs = new URLSearchParams(location.search);
    var paid = qs.get('paid');
    var failed = qs.get('failed');
    if (paid) setTimeout(function () { toast('Оплату <b>підтверджено</b> · ' + paid); }, 900);
    else if (failed) setTimeout(function () { toast('Оплата <b>не пройшла</b> · замовлення ' + failed); }, 900);
  } catch (e) {}

  render();
})();

