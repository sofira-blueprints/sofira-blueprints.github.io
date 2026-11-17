/* =====================================================================
   SOFIRA BLUEPRINTS — booking + message forms
   Time-zone aware scheduling, availability, validation, confirmation.
   Sends to the Google Apps Script backend set in config.js; falls back
   to a pre-filled email if the backend isn't connected yet.
   ===================================================================== */
(function () {
  "use strict";
  var CFG = window.SOFIRA_CONFIG || {};
  var $ = function (s, c) { return (c || document).querySelector(s); };
  var $$ = function (s, c) { return Array.prototype.slice.call((c || document).querySelectorAll(s)); };
  var toast = window.sbToast || function (m) { alert(m); };
  var EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  /* ---------- tabs (book / message) ---------- */
  var tabs = $$(".mode-switch [role=tab]");
  function selectTab(mode, focus) {
    tabs.forEach(function (t) {
      var on = t.dataset.mode === mode;
      t.setAttribute("aria-selected", String(on)); t.tabIndex = on ? 0 : -1;
      $("#" + t.getAttribute("aria-controls")).hidden = !on;
      if (on && focus) t.focus();
    });
  }
  tabs.forEach(function (t, i) {
    t.addEventListener("click", function () { selectTab(t.dataset.mode); history.replaceState(null, "", "#" + t.dataset.mode); });
    t.addEventListener("keydown", function (e) {
      if (e.key === "ArrowRight" || e.key === "ArrowLeft") { e.preventDefault(); var n = tabs[(i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) % tabs.length]; selectTab(n.dataset.mode, true); }
    });
  });
  if (location.hash === "#message") selectTab("message");
  window.addEventListener("hashchange", function () { if (location.hash === "#message" || location.hash === "#book") selectTab(location.hash.slice(1)); });

  /* ---------- time zones ---------- */
  var detected = (Intl.DateTimeFormat().resolvedOptions().timeZone) || "UTC";
  var zones = [];
  try { zones = Intl.supportedValuesOf("timeZone"); } catch (e) {}
  if (!zones.length) zones = ["Pacific/Honolulu","America/Anchorage","America/Los_Angeles","America/Denver","America/Chicago","America/New_York","America/Toronto","America/Sao_Paulo","Atlantic/Azores","Europe/London","Europe/Dublin","Europe/Lisbon","Africa/Lagos","Europe/Paris","Europe/Berlin","Africa/Johannesburg","Africa/Cairo","Africa/Nairobi","Europe/Istanbul","Asia/Dubai","Asia/Karachi","Asia/Kolkata","Asia/Dhaka","Asia/Bangkok","Asia/Singapore","Asia/Shanghai","Asia/Tokyo","Australia/Sydney","Pacific/Auckland","UTC"];
  if (zones.indexOf(detected) < 0) zones.unshift(detected);
  if (zones.indexOf("UTC") < 0) zones.push("UTC");
  function offsetLabel(tz) {
    try {
      var p = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset" }).formatToParts(new Date());
      var n = p.filter(function (x) { return x.type === "timeZoneName"; })[0];
      return n ? n.value.replace("GMT", "UTC").replace(/^UTC$/, "UTC+0") : "";
    } catch (e) { return ""; }
  }
  function offsetMinutes(tz) {
    var l = offsetLabel(tz).replace("UTC", ""); if (!l || l === "+0") return 0;
    var m = l.match(/([+-])(\d{1,2})(?::(\d{2}))?/); if (!m) return 0;
    return (m[1] === "-" ? -1 : 1) * (parseInt(m[2], 10) * 60 + parseInt(m[3] || "0", 10));
  }
  var zoneList = zones.map(function (z) { return { z: z, o: offsetMinutes(z), l: offsetLabel(z) }; }).sort(function (a, b) { return a.o - b.o || a.z.localeCompare(b.z); });
  $$("[data-tz-select]").forEach(function (sel) {
    var frag = document.createDocumentFragment();
    zoneList.forEach(function (x) { var o = document.createElement("option"); o.value = x.z; o.textContent = "(" + x.l + ") " + x.z.replace(/_/g, " ") + (x.z === detected ? "  · detected" : ""); frag.appendChild(o); });
    sel.appendChild(frag); sel.value = detected;
  });
  function fmt(d, tz, opts) { return new Intl.DateTimeFormat("en-GB", Object.assign({ timeZone: tz }, opts)).format(d); }
  function updateNow() {
    $$("[data-tz-select]").forEach(function (sel) {
      var now = sel.parentElement.querySelector("[data-tz-now]");
      if (now) now.textContent = "Your time: " + fmt(new Date(), sel.value, { hour: "2-digit", minute: "2-digit", weekday: "short" });
    });
  }
  updateNow(); setInterval(updateNow, 30000);

  /* =================================================================
     BOOKING
     ================================================================= */
  var form = $("#booking-form");
  if (form) {
    var tzSel = $("#booking-tz"), auditToggle = $("#audit-toggle"), busy = [], state = { month: null, date: null, slot: null };
    var daysEl = $("[data-cal-days]"), slotsEl = $("[data-slots]"), titleEl = $("[data-cal-title]"), slotsTitle = $("[data-slots-title]");
    var DUR = function () { return (auditToggle.checked ? CFG.callTypes.audit : CFG.callTypes.discovery).minutes; };
    var callLabel = function () { return (auditToggle.checked ? CFG.callTypes.audit : CFG.callTypes.discovery).label; };

    function dateKey(d, tz) {
      var p = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
      return p; // YYYY-MM-DD
    }
    function genSlots() {
      var res = [], off = (CFG.ownerUtcOffsetHours || 0), now = Date.now(), minStart = now + (CFG.minNoticeHours || 12) * 3600e3, dur = DUR();
      var ownerToday = dateKey(new Date(), CFG.ownerTimeZone || "Africa/Lagos").split("-").map(Number);
      for (var d = 0; d <= (CFG.bookingWindowDays || 30); d++) {
        var base = new Date(Date.UTC(ownerToday[0], ownerToday[1] - 1, ownerToday[2] + d));
        if ((CFG.workDays || [1,2,3,4,5]).indexOf(base.getUTCDay()) < 0) continue;
        for (var m = (CFG.dayStartHour || 9) * 60; m + dur <= (CFG.dayEndHour || 18) * 60; m += 30) {
          var start = Date.UTC(base.getUTCFullYear(), base.getUTCMonth(), base.getUTCDate(), 0, m) - off * 3600e3, end = start + dur * 60e3;
          if (start < minStart) continue;
          var clash = busy.some(function (b) { return start < b.e && end > b.s; });
          if (!clash) res.push({ s: start, e: end });
        }
      }
      return res;
    }
    var slots = [], byDay = {};
    function rebuild() {
      slots = genSlots(); byDay = {};
      var tz = tzSel.value;
      slots.forEach(function (s) { var k = dateKey(new Date(s.s), tz); (byDay[k] = byDay[k] || []).push(s); });
      if (!state.month) { var first = Object.keys(byDay).sort()[0] || dateKey(new Date(), tz); state.month = first.slice(0, 7); }
      if (state.date && !byDay[state.date]) { state.date = null; state.slot = null; }
      if (state.slot && !slots.some(function (s) { return s.s === state.slot.s; })) state.slot = null;
      renderCal(); renderSlots(); renderSummary();
    }
    function renderCal() {
      var y = +state.month.slice(0, 4), mo = +state.month.slice(5, 7) - 1, tz = tzSel.value;
      titleEl.textContent = new Date(Date.UTC(y, mo, 15)).toLocaleString("en-GB", { month: "long", year: "numeric", timeZone: "UTC" });
      var firstDow = (new Date(Date.UTC(y, mo, 1)).getUTCDay() + 6) % 7, days = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate(), today = dateKey(new Date(), tz);
      daysEl.innerHTML = "";
      for (var i = 0; i < firstDow; i++) daysEl.appendChild(document.createElement("span"));
      for (var dd = 1; dd <= days; dd++) {
        var k = y + "-" + String(mo + 1).padStart(2, "0") + "-" + String(dd).padStart(2, "0"), b = document.createElement("button");
        b.type = "button"; b.className = "cal__day"; b.textContent = dd; b.dataset.key = k;
        var has = !!byDay[k];
        b.disabled = !has; if (has) b.classList.add("has-slots"); if (k === today) b.classList.add("is-today");
        b.setAttribute("aria-pressed", String(k === state.date));
        b.setAttribute("aria-label", new Date(Date.UTC(y, mo, dd, 12)).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }) + (has ? ", " + byDay[k].length + " times available" : ", unavailable"));
        daysEl.appendChild(b);
      }
      var keys = Object.keys(byDay).sort(), minM = (keys[0] || state.month).slice(0, 7), maxM = (keys[keys.length - 1] || state.month).slice(0, 7);
      $("[data-cal-prev]").disabled = state.month <= minM; $("[data-cal-next]").disabled = state.month >= maxM;
    }
    function renderSlots() {
      slotsEl.innerHTML = ""; var tz = tzSel.value;
      if (!state.date) { slotsTitle.textContent = "Select a date to see available times"; return; }
      var list = byDay[state.date] || [];
      slotsTitle.textContent = new Date(list[0].s).toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: tz });
      list.forEach(function (s) {
        var b = document.createElement("button"); b.type = "button"; b.className = "slot";
        b.textContent = fmt(new Date(s.s), tz, { hour: "2-digit", minute: "2-digit", hour12: false });
        b.setAttribute("aria-pressed", String(!!state.slot && state.slot.s === s.s)); b.dataset.s = s.s;
        slotsEl.appendChild(b);
      });
    }
    function describe(s) {
      var tz = tzSel.value, d = new Date(s.s);
      var you = d.toLocaleString("en-GB", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", hour12: false, timeZone: tz });
      var lagos = fmt(d, CFG.ownerTimeZone, { hour: "2-digit", minute: "2-digit", hour12: false });
      return callLabel() + " · " + you + " (" + tz.replace(/_/g, " ") + ")" + (tz !== CFG.ownerTimeZone ? " · " + lagos + " my time (UTC+1)" : "");
    }
    function renderSummary() {
      var bar = $("[data-summary]");
      bar.hidden = !state.slot;
      if (state.slot) $$("[data-summary-text]").forEach(function (el) { el.textContent = describe(state.slot); });
    }
    daysEl.addEventListener("click", function (e) { var b = e.target.closest(".cal__day"); if (!b || b.disabled) return; state.date = b.dataset.key; state.slot = null; renderCal(); renderSlots(); renderSummary(); var f = $(".slot", slotsEl); if (f && window.innerWidth < 720) f.scrollIntoView({ block: "nearest", behavior: "smooth" }); });
    slotsEl.addEventListener("click", function (e) { var b = e.target.closest(".slot"); if (!b) return; state.slot = (byDay[state.date] || []).filter(function (s) { return String(s.s) === b.dataset.s; })[0]; renderSlots(); renderSummary(); $("[data-next-step]").focus(); });
    $("[data-cal-prev]").addEventListener("click", function () { var y = +state.month.slice(0, 4), m = +state.month.slice(5, 7) - 2; if (m < 0) { m = 11; y--; } state.month = y + "-" + String(m + 1).padStart(2, "0"); renderCal(); });
    $("[data-cal-next]").addEventListener("click", function () { var y = +state.month.slice(0, 4), m = +state.month.slice(5, 7); if (m > 11) { m = 0; y++; } state.month = y + "-" + String(m + 1).padStart(2, "0"); renderCal(); });
    tzSel.addEventListener("change", function () { updateNow(); state.date = state.slot ? dateKey(new Date(state.slot.s), tzSel.value) : null; state.month = state.date ? state.date.slice(0, 7) : null; rebuild(); });

    function syncAudit() {
      $$("[data-audit-only]").forEach(function (f) { f.hidden = !auditToggle.checked; });
      $("[data-audit-desc]").textContent = auditToggle.checked
        ? CFG.callTypes.audit.minutes + "-minute Free Audit + Discovery Call: I review your account first and bring a fix list."
        : CFG.callTypes.discovery.minutes + "-minute Discovery Call: talk through your goals and get a recommended plan.";
      rebuild();
    }
    auditToggle.addEventListener("change", syncAudit);

    function goStep(n) {
      $$("[data-step]").forEach(function (s) { s.hidden = s.dataset.step !== String(n); });
      $$("[data-step-ind]").forEach(function (li) { var k = +li.dataset.stepInd; li.classList.toggle("is-current", k === n); li.classList.toggle("is-done", k < n); });
      var focusEl = n === 2 ? $("#b-name") : n === 3 ? $('[data-step="3"]') : $(".cal__day[aria-pressed=true]") || $(".cal__day.has-slots");
      if (focusEl) setTimeout(function () { focusEl.focus(); }, 30);
      $("#book").scrollIntoView({ block: "start", behavior: "smooth" });
    }
    $("[data-next-step]").addEventListener("click", function () { if (state.slot) goStep(2); });
    $("[data-prev-step]").addEventListener("click", function () { goStep(1); });

    /* availability from the backend (busy times on the calendar) */
    function loadBusy() {
      if (!CFG.backendUrl) { $("[data-avail-note]").textContent = "Times are shown in your selected time zone."; return Promise.resolve(); }
      var from = new Date().toISOString(), to = new Date(Date.now() + ((CFG.bookingWindowDays || 30) + 1) * 864e5).toISOString();
      return fetch(CFG.backendUrl + "?action=availability&from=" + encodeURIComponent(from) + "&to=" + encodeURIComponent(to))
        .then(function (r) { return r.json(); })
        .then(function (j) { if (j && j.ok && j.busy) busy = j.busy.map(function (b) { return { s: Date.parse(b.start), e: Date.parse(b.end) }; }); })
        .catch(function () {});
    }

    syncAudit();
    loadBusy().then(rebuild);

    /* validation */
    function setErr(input, msg) { var f = input.closest(".field"); f.classList.toggle("has-error", !!msg); input.setAttribute("aria-invalid", String(!!msg)); var e = $(".err", f); if (e) e.textContent = msg || ""; return !msg; }
    function validateBooking() {
      var ok = true, first = null;
      function chk(el, cond, msg) { var good = setErr(el, cond ? "" : msg); if (!good && !first) first = el; ok = ok && good; }
      chk(form.name, form.name.value.trim().length >= 2, "Please enter your name.");
      chk(form.email, EMAIL_RE.test(form.email.value.trim()), "Please enter a valid email, like name@company.com.");
      chk(form.goals, form.goals.value.trim().length >= 10, "A sentence or two helps me prepare (10+ characters).");
      if (auditToggle.checked && form.website.value.trim()) chk(form.website, /^https?:\/\/\S+\.\S+/.test(form.website.value.trim()) || /^\S+\.\S+$/.test(form.website.value.trim()), "Please enter a valid URL, like https://yourstore.com");
      if (first) first.focus();
      return ok;
    }
    $$("input, textarea", form).forEach(function (el) { el.addEventListener("input", function () { if (el.getAttribute("aria-invalid") === "true") setErr(el, ""); }); });

    function ics(s, title, desc) {
      var z = function (t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
      return "BEGIN:VCALENDAR\r\nVERSION:2.0\r\nPRODID:-//Sofira Blueprints//Booking//EN\r\nBEGIN:VEVENT\r\nUID:" + s.s + "@sofirablueprints\r\nDTSTAMP:" + z(Date.now()) + "\r\nDTSTART:" + z(s.s) + "\r\nDTEND:" + z(s.e) + "\r\nSUMMARY:" + title + "\r\nDESCRIPTION:" + desc.replace(/\n/g, "\\n") + "\r\nBEGIN:VALARM\r\nTRIGGER:-PT1H\r\nACTION:DISPLAY\r\nDESCRIPTION:Reminder\r\nEND:VALARM\r\nEND:VEVENT\r\nEND:VCALENDAR";
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!state.slot) { goStep(1); toast("Please pick a time first."); return; }
      if (form.company_website.value) return;
      if (!validateBooking()) return;
      var btn = $("button[type=submit]", form), s = state.slot, tz = tzSel.value;
      var payload = {
        type: "booking", callType: auditToggle.checked ? "audit" : "discovery", callLabel: callLabel(), audit: auditToggle.checked,
        start: new Date(s.s).toISOString(), end: new Date(s.e).toISOString(), durationMinutes: DUR(), timezone: tz,
        localTime: describe(s), name: form.name.value.trim(), email: form.email.value.trim(), company: form.company.value.trim(),
        phone: form.phone.value.trim(), website: auditToggle.checked ? form.website.value.trim() : "", platform: auditToggle.checked ? form.platform.value : "",
        goals: form.goals.value.trim(), page: location.href
      };
      btn.disabled = true; $("span", btn).textContent = "Booking…";
      var title = payload.callLabel + " with Sofira Blueprints";
      function done(meet, viaEmail) {
        var desc = "Call with Sofiat Adedeji (Sofira Blueprints)." + (meet ? "\nJoin: " + meet : "\nThe meeting link is in your confirmation email.") + "\nQuestions: " + CFG.ownerEmail;
        $("[data-ics]").href = "data:text/calendar;charset=utf-8," + encodeURIComponent(ics(s, title, desc));
        var g = function (t) { return new Date(t).toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, ""); };
        $("[data-gcal]").href = "https://calendar.google.com/calendar/render?action=TEMPLATE&text=" + encodeURIComponent(title) + "&dates=" + g(s.s) + "/" + g(s.e) + "&details=" + encodeURIComponent(desc) + "&ctz=" + encodeURIComponent(tz);
        $("[data-success-title]").textContent = viaEmail ? "Almost done: send the email" : "You're booked, " + payload.name.split(" ")[0] + "!";
        $("[data-success-text]").textContent = viaEmail
          ? "Your email app has opened with your booking request for " + describe(s) + ". Press send and I'll confirm by email within 24 hours."
          : describe(s) + ". A confirmation with the meeting link is on its way to " + payload.email + ", with reminders 24 hours and 1 hour before.";
        goStep(3);
      }
      window.sbSend(payload).then(function (j) { done(j.meetLink, false); }).catch(function (err) {
        if (err && err.message === "slot-taken") { toast("Sorry, that time was just taken. Please choose another."); btn.disabled = false; $("span", btn).textContent = "Confirm booking"; loadBusy().then(rebuild); goStep(1); return; }
        var body = "Hi Sofiat,\n\nI'd like to book: " + describe(s) + "\n\nName: " + payload.name + "\nEmail: " + payload.email + (payload.company ? "\nCompany: " + payload.company : "") + (payload.phone ? "\nWhatsApp/phone: " + payload.phone : "") + (payload.website ? "\nWebsite: " + payload.website : "") + (payload.platform ? "\nPlatform: " + payload.platform : "") + "\n\nGoals:\n" + payload.goals;
        location.href = "mailto:" + CFG.ownerEmail + "?subject=" + encodeURIComponent("Booking request: " + payload.callLabel) + "&body=" + encodeURIComponent(body);
        done(null, true);
      });
    });
  }

  /* =================================================================
     MESSAGE
     ================================================================= */
  var mf = $("#message-form");
  if (mf) {
    var replySel = $("#m-reply"), phoneField = $("[data-phone-field]");
    replySel.addEventListener("change", function () { phoneField.hidden = replySel.value === "email"; });
    $("#message-tz").addEventListener("change", updateNow);
    function setErr2(input, msg) { var f = input.closest(".field"); f.classList.toggle("has-error", !!msg); input.setAttribute("aria-invalid", String(!!msg)); $(".err", f).textContent = msg || ""; return !msg; }
    $$("input, textarea", mf).forEach(function (el) { el.addEventListener("input", function () { if (el.getAttribute("aria-invalid") === "true") setErr2(el, ""); }); });
    mf.addEventListener("submit", function (e) {
      e.preventDefault();
      if (mf.company_website.value) return;
      var ok = true, first = null;
      function chk(el, cond, msg) { var g = setErr2(el, cond ? "" : msg); if (!g && !first) first = el; ok = ok && g; }
      chk(mf.name, mf.name.value.trim().length >= 2, "Please enter your name.");
      chk(mf.email, EMAIL_RE.test(mf.email.value.trim()), "Please enter a valid email, like name@company.com.");
      if (replySel.value !== "email") chk(mf.phone, mf.phone.value.replace(/\D/g, "").length >= 7, "Please add a number I can reach you on.");
      chk(mf.message, mf.message.value.trim().length >= 10, "Please write a little more (10+ characters).");
      if (!ok) { first.focus(); return; }
      var btn = $("button[type=submit]", mf); btn.disabled = true; $("span", btn).textContent = "Sending…";
      var tz = $("#message-tz").value;
      var payload = { type: "message", name: mf.name.value.trim(), email: mf.email.value.trim(), topic: mf.topic.value, replyVia: replySel.value, phone: mf.phone.value.trim(), message: mf.message.value.trim(), timezone: tz, localTime: fmt(new Date(), tz, { dateStyle: "medium", timeStyle: "short" }), page: location.href };
      function show(text) { mf.hidden = true; var s = $("[data-message-success]"); s.hidden = false; if (text) $("[data-message-success-text]").textContent = text; s.focus(); }
      window.sbSend(payload).then(function () { show(); }).catch(function () {
        var body = payload.message + "\n\n—\n" + payload.name + "\n" + payload.email + (payload.phone ? "\n" + payload.phone : "") + "\nTime zone: " + tz + "\nPreferred reply: " + payload.replyVia;
        location.href = "mailto:" + CFG.ownerEmail + "?subject=" + encodeURIComponent(payload.topic + " — " + payload.name) + "&body=" + encodeURIComponent(body);
        show("Your email app has opened with your message. Press send and I'll reply within 24 hours.");
      });
    });
  }
})();
