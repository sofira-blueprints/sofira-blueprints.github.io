/* =====================================================================
   SOFIRA BLUEPRINTS — site interactions (vanilla JS, no dependencies)
   Content is always visible; motion is a progressive enhancement only.
   ===================================================================== */
(function () {
  "use strict";
  var doc = document.documentElement;
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var store = {
    get: function (k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set: function (k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  };
  var CFG = window.SOFIRA_CONFIG || {};

  /* ---------- toast ---------- */
  var toastEl = $(".toast"), toastT;
  function toast(msg) {
    if (!toastEl) return;
    toastEl.textContent = msg; toastEl.classList.add("is-on");
    clearTimeout(toastT); toastT = setTimeout(function () { toastEl.classList.remove("is-on"); }, 4200);
  }
  window.sbToast = toast;

  /* ---------- theme ---------- */
  function setThemeLabel() {
    var dark = doc.getAttribute("data-theme") === "dark";
    $$("[data-theme-toggle]").forEach(function (b) { b.setAttribute("aria-label", dark ? "Switch to light mode" : "Switch to dark mode"); });
  }
  setThemeLabel();
  $$("[data-theme-toggle]").forEach(function (b) {
    b.addEventListener("click", function () {
      var next = doc.getAttribute("data-theme") === "dark" ? "light" : "dark";
      doc.setAttribute("data-theme", next); store.set("sb-theme", next); setThemeLabel();
    });
  });
  try {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", function (e) {
      if (!store.get("sb-theme")) { doc.setAttribute("data-theme", e.matches ? "dark" : "light"); setThemeLabel(); }
    });
  } catch (e) {}

  /* ---------- header ---------- */
  var header = $(".site-header"), lastY = 0;
  function onHeader() {
    var y = window.scrollY;
    if (header) {
      header.classList.toggle("is-solid", y > 10);
      header.classList.toggle("is-hidden", y > 500 && y > lastY + 4 && !document.body.classList.contains("menu-open"));
      if (y < lastY - 4) header.classList.remove("is-hidden");
    }
    lastY = y;
  }
  window.addEventListener("scroll", onHeader, { passive: true }); onHeader();

  /* ---------- mobile menu ---------- */
  var mt = $(".menu-toggle"), mm = $("#mobile-menu");
  function setMenu(open) {
    if (!mt || !mm) return;
    mt.setAttribute("aria-expanded", String(open)); mt.setAttribute("aria-label", open ? "Close menu" : "Open menu");
    mm.hidden = !open; document.body.classList.toggle("menu-open", open);
    $$(".mobile-menu__list a", mm).forEach(function (a, i) { a.style.setProperty("--d", i); });
  }
  if (mt) mt.addEventListener("click", function () { setMenu(mt.getAttribute("aria-expanded") !== "true"); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape" && mt && mt.getAttribute("aria-expanded") === "true") { setMenu(false); mt.focus(); } });
  try { window.matchMedia("(min-width: 1001px)").addEventListener("change", function (e) { if (e.matches) setMenu(false); }); } catch (e) {}

  /* ---------- reveal on scroll (safe: only hides things below the fold, and
                 a scroll check — not IntersectionObserver — reveals them) ---------- */
  function countUp(el) {
    if (el.dataset.counted) return; el.dataset.counted = "1";
    var end = parseFloat(el.dataset.count), dec = (el.dataset.count.split(".")[1] || "").length;
    if (reduce || isNaN(end)) return;
    var t0 = null;
    el.textContent = (0).toFixed(dec);
    (function f(now) {
      if (!t0) t0 = now;
      var p = Math.min(1, (now - t0) / 1400), v = end * (1 - Math.pow(1 - p, 4));
      el.textContent = v.toFixed(dec); if (p < 1) requestAnimationFrame(f); else el.textContent = end.toFixed(dec);
    })(performance.now());
    setTimeout(function () { el.textContent = end.toFixed(dec); }, 2000);
  }
  var pending = [];
  function prepare(root) {
    var vh = window.innerHeight;
    $$("[data-reveal]", root).forEach(function (el) {
      if (el.dataset.rvDone) return; el.dataset.rvDone = "1";
      if (reduce) return;
      if (el.getBoundingClientRect().top > vh * 0.95) { el.classList.add("rv"); pending.push(el); }
    });
    $$("[data-count]", root).forEach(function (el) { pending.push(el); });
    $$("[data-flow]", root).forEach(function (el) { if (!reduce) { el.classList.add("anim"); pending.push(el); } });
    check();
  }
  function check() {
    var vh = window.innerHeight, row = 0, lastTop = null;
    pending = pending.filter(function (el) {
      var r = el.getBoundingClientRect();
      if (r.top < vh * 0.92) {
        if (el.classList.contains("rv")) {
          if (lastTop !== null && Math.abs(r.top - lastTop) < 40) row++; else row = 0;
          lastTop = r.top; el.style.setProperty("--delay", Math.min(row, 4) * 90 + "ms");
          el.classList.add("is-in");
        }
        if (el.hasAttribute("data-flow")) el.classList.add("is-live");
        if (el.dataset.count) countUp(el);
        return false;
      }
      return true;
    });
  }
  var ticking = false;
  function onScrollCheck() { if (ticking) return; ticking = true; requestAnimationFrame(function () { ticking = false; check(); }); }
  window.addEventListener("scroll", onScrollCheck, { passive: true });
  window.addEventListener("resize", onScrollCheck);
  window.addEventListener("load", check);
  /* hard failsafe: never leave anything hidden */
  setInterval(check, 700);
  window.addEventListener("scroll", function () { setTimeout(check, 120); }, { passive: true });
  prepare(document);
  window.sbObserve = function (root) { prepare(root); setTimeout(function () { $$(".rv", root).forEach(function (el) { el.classList.add("is-in"); }); $$("[data-flow]", root).forEach(function (el) { el.classList.add("is-live"); }); }, 400); };

  /* ---------- scroll progress ---------- */
  var pbar = $(".progress-bar");
  if (pbar) {
    var setP = function () { var h = document.documentElement.scrollHeight - innerHeight; pbar.style.setProperty("--p", h > 0 ? Math.min(1, scrollY / h) : 0); };
    window.addEventListener("scroll", setP, { passive: true }); setP();
  }

  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  /* ---------- hero photo parallax (desktop only) ---------- */
  var hv = $(".hero__visual"), hp = hv && $(".hero__photo", hv);
  if (hv && hp && fine && !reduce) {
    var hero = hv.closest("section");
    hero.addEventListener("pointermove", function (e) {
      var r = hero.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
      hp.style.setProperty("--ry", (x * 6).toFixed(2) + "deg"); hp.style.setProperty("--rx", (-y * 5).toFixed(2) + "deg");
      hp.style.setProperty("--px", (x * -10).toFixed(1) + "px"); hp.style.setProperty("--py", (y * -10).toFixed(1) + "px");
    });
    hero.addEventListener("pointerleave", function () { ["--ry", "--rx", "--px", "--py"].forEach(function (p) { hp.style.removeProperty(p); }); });
  }

  /* ---------- 3D tilt on cards ---------- */
  if (fine && !reduce) {
    $$(".svc, .pain, .value, .industry, .review, .pkg, .cert").forEach(function (c) {
      c.classList.add("tilt");
      c.addEventListener("pointermove", function (e) {
        var r = c.getBoundingClientRect(), x = (e.clientX - r.left) / r.width - .5, y = (e.clientY - r.top) / r.height - .5;
        c.classList.add("is-tilting");
        c.style.transform = "perspective(900px) rotateX(" + (-y * 5).toFixed(2) + "deg) rotateY(" + (x * 6).toFixed(2) + "deg) translateY(-4px)";
      });
      c.addEventListener("pointerleave", function () { c.classList.remove("is-tilting"); c.style.transform = ""; });
    });
  }

  /* ---------- interactive blueprint tabs ---------- */
  $$("[data-blueprint]").forEach(function (tool) {
    var tabs = $$("[role=tab]", tool), timer, userTouched = false;
    var select = function (t, focus) {
      tabs.forEach(function (b) {
        var on = b === t, p = $("#" + b.getAttribute("aria-controls"));
        b.setAttribute("aria-selected", String(on)); b.tabIndex = on ? 0 : -1; p.hidden = !on;
        if (on) {
          var f = $("[data-flow]", p); p.classList.remove("is-switching"); void p.offsetWidth; p.classList.add("is-switching");
          if (f && !reduce) { f.classList.add("anim"); f.classList.remove("is-live"); void f.offsetWidth; requestAnimationFrame(function () { f.classList.add("is-live"); }); setTimeout(function () { f.classList.add("is-live"); }, 120); }
        }
      });
      if (focus) t.focus();
    };
    tabs.forEach(function (b, i) {
      b.addEventListener("click", function () { userTouched = true; clearInterval(timer); select(b); });
      b.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return; e.preventDefault(); userTouched = true; clearInterval(timer);
        select(tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length], true);
      });
    });
    /* gently auto-cycle until the visitor interacts */
    if (!reduce) timer = setInterval(function () {
      if (userTouched) return clearInterval(timer);
      var r = tool.getBoundingClientRect(); if (r.bottom < 0 || r.top > innerHeight) return;
      var cur = tabs.findIndex(function (b) { return b.getAttribute("aria-selected") === "true"; });
      select(tabs[(cur + 1) % tabs.length]);
    }, 7000);
    tool.addEventListener("pointerenter", function () { userTouched = true; });
  });

  /* ---------- review carousel ---------- */
  $$("[data-carousel]").forEach(function (car) {
    var track = $(".carousel__track", car), slides = $$(".carousel__slide", track), dotsWrap = $(".carousel__dots", car), paused = false, timer;
    var step = function () { return slides.length > 1 ? slides[1].offsetLeft - slides[0].offsetLeft : track.clientWidth; };
    var current = function () { return Math.round(track.scrollLeft / Math.max(1, step())); };
    var maxIdx = function () { return Math.max(0, Math.round((track.scrollWidth - track.clientWidth) / Math.max(1, step()))); };
    var go = function (i) { var m = maxIdx(); if (i > m) i = 0; if (i < 0) i = m; track.scrollTo({ left: i * step(), behavior: reduce ? "auto" : "smooth" }); };
    var dots = slides.map(function (s, i) {
      var b = document.createElement("button"); b.type = "button"; b.setAttribute("aria-label", "Show review " + (i + 1));
      b.addEventListener("click", function () { paused = true; go(i); }); dotsWrap.appendChild(b); return b;
    });
    var sync = function () {
      var c = current(), m = maxIdx();
      dots.forEach(function (d, i) { d.hidden = i > m; d.setAttribute("aria-current", String(i === Math.min(c, m))); });
    };
    track.addEventListener("scroll", function () { requestAnimationFrame(sync); }, { passive: true });
    window.addEventListener("resize", sync);
    $(".carousel__prev", car).addEventListener("click", function () { paused = true; go(current() - 1); });
    $(".carousel__next", car).addEventListener("click", function () { paused = true; go(current() + 1); });
    track.addEventListener("keydown", function (e) { if (e.key === "ArrowRight") { e.preventDefault(); paused = true; go(current() + 1); } if (e.key === "ArrowLeft") { e.preventDefault(); paused = true; go(current() - 1); } });
    ["pointerenter", "focusin", "touchstart"].forEach(function (ev) { car.addEventListener(ev, function () { paused = true; }, { passive: true }); });
    car.addEventListener("pointerleave", function () { paused = false; });
    if (!reduce) timer = setInterval(function () {
      var r = car.getBoundingClientRect(); if (paused || r.bottom < 0 || r.top > innerHeight) return; go(current() + 1);
    }, 6000);
    sync();
  });

  /* ---------- work: filters, search, drawer ---------- */
  var grid = $("[data-case-grid]");
  if (grid) {
    var cards = $$(".case-card", grid), state = { cat: "all", platform: null, q: "" }, rc = $("[data-result-count]"), empty = $("[data-empty]");
    var apply = function () {
      var n = 0;
      cards.forEach(function (c) {
        var ok = (state.cat === "all" || c.dataset.cat === state.cat) && (!state.platform || (" " + c.dataset.platforms + " ").indexOf(" " + state.platform + " ") > -1) && (!state.q || c.dataset.search.indexOf(state.q) > -1);
        c.hidden = !ok; if (ok) { n++; c.classList.add("is-in"); }
      });
      if (rc) rc.textContent = n + (n === 1 ? " case study" : " case studies");
      if (empty) empty.hidden = n > 0;
      check();
    };
    $$("[data-cat-tab]").forEach(function (b) {
      b.addEventListener("click", function () { state.cat = b.dataset.catTab; $$("[data-cat-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); }); apply(); });
    });
    $$(".platform-filters .filter").forEach(function (b) {
      b.addEventListener("click", function () {
        var on = b.getAttribute("aria-pressed") !== "true";
        $$(".platform-filters .filter").forEach(function (x) { x.setAttribute("aria-pressed", "false"); });
        b.setAttribute("aria-pressed", String(on)); state.platform = on ? b.dataset.platform : null; apply();
      });
    });
    var si = $("[data-case-search]");
    if (si) si.addEventListener("input", function () { state.q = si.value.trim().toLowerCase(); apply(); });
    var pre = new URLSearchParams(location.search).get("platform");
    if (pre) { var pb = $('.platform-filters .filter[data-platform="' + pre + '"]'); if (pb) pb.click(); }
    apply();
  }

  var drawer = $("[data-drawer]");
  if (drawer) {
    var panel = $(".drawer__panel", drawer), body = $(".drawer__body", drawer), openLink = $("[data-drawer-open]", drawer), lastFocus = null, order = [], curIdx = -1;
    var visibleSlugs = function () { return $$(".case-card:not([hidden]) [data-case]").map(function (a) { return a.dataset.case; }); };
    var load = function (slug) {
      order = visibleSlugs(); curIdx = order.indexOf(slug);
      body.innerHTML = '<p class="drawer__loading">Loading case study…</p>';
      var href = "work/" + slug + ".html"; openLink.href = href;
      fetch(href).then(function (r) { if (!r.ok) throw 0; return r.text(); }).then(function (html) {
        var d = new DOMParser().parseFromString(html, "text/html"), art = d.querySelector("[data-case-article]");
        if (!art) throw 0;
        $$("img", art).forEach(function (im, k) { im.setAttribute("src", "work/" + im.getAttribute("src")); im.loading = k === 0 ? "eager" : "lazy"; });
        $$(".case-next, .crumbs", art).forEach(function (n) { n.remove(); });
        var lb = d.querySelector("[data-lightbox-data]");
        body.innerHTML = ""; body.appendChild(art);
        if (lb) { var s = document.createElement("script"); s.type = "application/json"; s.setAttribute("data-lightbox-data", ""); s.textContent = lb.textContent; body.appendChild(s); }
        window.sbObserve(body); bindLightbox(body, "");
        panel.scrollTop = 0;
      }).catch(function () { location.href = href; });
      history.replaceState(null, "", "#" + slug);
    };
    var open = function (slug) {
      lastFocus = document.activeElement; drawer.classList.add("is-open"); drawer.removeAttribute("aria-hidden"); document.body.style.overflow = "hidden";
      load(slug); setTimeout(function () { $(".drawer__close", drawer).focus(); }, 50);
    };
    var close = function () {
      drawer.classList.remove("is-open"); drawer.setAttribute("aria-hidden", "true"); document.body.style.overflow = "";
      history.replaceState(null, "", location.pathname + location.search); if (lastFocus) lastFocus.focus();
    };
    document.addEventListener("click", function (e) {
      var a = e.target.closest("[data-case]");
      if (!a || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
      e.preventDefault(); open(a.dataset.case);
    });
    $$("[data-drawer-close]", drawer).forEach(function (b) { b.addEventListener("click", close); });
    $("[data-drawer-prev]", drawer).addEventListener("click", function () { if (order.length) load(order[(curIdx - 1 + order.length) % order.length]); });
    $("[data-drawer-next]", drawer).addEventListener("click", function () { if (order.length) load(order[(curIdx + 1) % order.length]); });
    panel.addEventListener("scroll", function () {
      $$(".rv:not(.is-in)", body).forEach(function (el) { if (el.getBoundingClientRect().top < innerHeight * .92) el.classList.add("is-in"); });
    }, { passive: true });
    document.addEventListener("keydown", function (e) {
      if (!drawer.classList.contains("is-open")) return;
      if (e.key === "Escape" && !$(".lightbox:not([hidden])")) close();
      if (e.key === "Tab") { var f = $$("a[href], button:not([disabled])", panel).filter(function (x) { return x.offsetParent; }); if (!f.length) return; var first = f[0], last = f[f.length - 1]; if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); } else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); } }
    });
    if (location.hash.length > 1 && $('[data-case="' + location.hash.slice(1) + '"]')) open(location.hash.slice(1));
  }

  /* ---------- lightbox ---------- */
  var lbEl;
  function closeLb() { if (!lbEl) return; lbEl.hidden = true; if (lbEl._opener) lbEl._opener.focus(); }
  function bindLightbox(scope, prefix) {
    var dataEl = $("[data-lightbox-data]", scope); if (!dataEl) return;
    var items; try { items = JSON.parse(dataEl.textContent); } catch (e) { return; }
    if (!items || !items.length) return;
    var root = prefix != null ? prefix : (dataEl.getAttribute("data-root") || "");
    if (!lbEl) {
      lbEl = document.createElement("div"); lbEl.className = "lightbox"; lbEl.hidden = true; lbEl.setAttribute("role", "dialog"); lbEl.setAttribute("aria-modal", "true"); lbEl.setAttribute("aria-label", "Image viewer");
      lbEl.innerHTML = '<button class="icon-btn lightbox__close" type="button" aria-label="Close image"><svg><use href="#i-close"/></svg></button><button class="icon-btn lightbox__prev" type="button" aria-label="Previous image"><svg><use href="#i-arrow"/></svg></button><button class="icon-btn lightbox__next" type="button" aria-label="Next image"><svg><use href="#i-arrow"/></svg></button><figure style="margin:0"><img alt=""><p></p></figure>';
      document.body.appendChild(lbEl);
      lbEl.addEventListener("click", function (e) { if (e.target === lbEl) closeLb(); });
      $(".lightbox__close", lbEl).addEventListener("click", closeLb);
      document.addEventListener("keydown", function (e) { if (lbEl.hidden) return; if (e.key === "Escape") closeLb(); if (e.key === "ArrowRight" && lbEl._go) lbEl._go(1); if (e.key === "ArrowLeft" && lbEl._go) lbEl._go(-1); });
    }
    var idx = 0;
    var show = function (i) { idx = (i + items.length) % items.length; var im = $("img", lbEl); im.src = root + items[idx].src; im.alt = items[idx].alt; $("p", lbEl).textContent = items[idx].alt + "  (" + (idx + 1) + "/" + items.length + ")"; };
    $$("[data-lightbox]", scope).forEach(function (b) {
      b.addEventListener("click", function () {
        lbEl._go = function (d) { show(idx + d); };
        $(".lightbox__prev", lbEl).onclick = function () { show(idx - 1); }; $(".lightbox__next", lbEl).onclick = function () { show(idx + 1); };
        $(".lightbox__prev", lbEl).hidden = $(".lightbox__next", lbEl).hidden = items.length < 2;
        show(+b.dataset.lightbox); lbEl.hidden = false; $(".lightbox__close", lbEl).focus(); lbEl._opener = b;
      });
    });
  }
  bindLightbox(document);

  /* ---------- blog filter + search ---------- */
  var bstate = { t: "all", q: "" }, bsearch = $("[data-post-search]"), bempty = $("[data-post-empty]");
  var blogApply = function () {
    var n = 0;
    $$("[data-post-grid] [data-post-cat]").forEach(function (p) {
      var ok = (bstate.t === "all" || p.dataset.postCat.indexOf(bstate.t) > -1) && (!bstate.q || (p.dataset.search || "").indexOf(bstate.q) > -1);
      p.hidden = !ok; if (ok) { n++; p.classList.add("is-in"); }
    });
    if (bempty) bempty.hidden = n > 0;
  };
  $$("[data-post-tab]").forEach(function (b) {
    b.addEventListener("click", function () {
      bstate.t = b.dataset.postTab;
      $$("[data-post-tab]").forEach(function (x) { x.setAttribute("aria-pressed", String(x === b)); });
      blogApply();
    });
  });
  if (bsearch) bsearch.addEventListener("input", function () { bstate.q = bsearch.value.trim().toLowerCase(); blogApply(); });

  /* ---------- article TOC highlighting ---------- */
  var tocLinks = $$(".toc a");
  if (tocLinks.length) {
    var heads = tocLinks.map(function (a) { return document.getElementById(a.getAttribute("href").slice(1)); }).filter(Boolean);
    var tocUpdate = function () {
      var cur = heads[0];
      heads.forEach(function (h) { if (h.getBoundingClientRect().top < innerHeight * 0.3) cur = h; });
      tocLinks.forEach(function (a) { a.classList.toggle("is-active", cur && a.getAttribute("href") === "#" + cur.id); });
    };
    window.addEventListener("scroll", tocUpdate, { passive: true }); tocUpdate();
  }

  /* ---------- newsletter subscribe ---------- */
  $$("[data-subscribe]").forEach(function (f) {
    f.addEventListener("submit", function (e) {
      e.preventDefault();
      var em = f.elements.email, msg = $(".mini-form__msg", f), v = (em.value || "").trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { msg.textContent = "Please enter a valid email address."; em.focus(); return; }
      if (f.elements.company_website && f.elements.company_website.value) return;
      var btn = $("button", f); btn.disabled = true; msg.textContent = "Subscribing…";
      window.sbSend({ type: "subscribe", email: v, page: location.pathname, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone })
        .then(function () { msg.textContent = "You're in! Check your inbox for a welcome note."; f.reset(); })
        .catch(function () { msg.textContent = "Couldn't subscribe right now — email sofirablueprints@gmail.com and I'll add you."; })
        .then(function () { btn.disabled = false; });
    });
  });

  /* ---------- backend sender (Google Apps Script web app) ---------- */
  window.sbSend = function (payload) {
    if (!CFG.backendUrl) return Promise.reject(new Error("not-configured"));
    payload.sentAt = new Date().toISOString();
    return fetch(CFG.backendUrl, { method: "POST", headers: { "Content-Type": "text/plain;charset=utf-8" }, body: JSON.stringify(payload) })
      .then(function (r) { return r.json(); })
      .then(function (j) { if (!j || !j.ok) throw new Error((j && j.error) || "failed"); return j; });
  };

  /* ---------- misc ---------- */
  $$("[data-year]").forEach(function (el) { el.textContent = new Date().getFullYear(); });
  var lt = $$("[data-lagos-time]");
  function tickTime() { var s = new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Lagos", hour: "2-digit", minute: "2-digit" }).format(new Date()); lt.forEach(function (el) { el.textContent = s; }); }
  if (lt.length) { tickTime(); setInterval(tickTime, 30000); }
  $$(".marquee__track").forEach(function (t) {
    var g = $(".marquee__group", t); if (!g || t.children.length > 1) return;
    var c = g.cloneNode(true); c.setAttribute("aria-hidden", "true"); t.appendChild(c);
  });
})();
