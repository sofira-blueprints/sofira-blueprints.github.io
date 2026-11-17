/**
 * =====================================================================
 *  SOFIRA BLUEPRINTS — Booking & lead automation (Google Apps Script)
 * ---------------------------------------------------------------------
 *  What it does, automatically, every time someone uses the website:
 *   • Book a call   → checks your Google Calendar is free, creates the
 *                     event with a Google Meet link, invites the client,
 *                     logs it in your Google Sheet, emails the client a
 *                     confirmation, emails YOU a "new booking" alert, and
 *                     sends the client reminders 24 h and 1 h before.
 *   • Send a message → logs it in the Sheet, emails you the message
 *                     (reply goes straight to the sender) and sends the
 *                     sender an acknowledgement.
 *   • Newsletter     → logs subscribers and sends a welcome email.
 *  Setup instructions: see SETUP.md in the same folder.
 * =====================================================================
 */

const CONFIG = {
  OWNER_EMAIL: "sofirablueprints@gmail.com",
  OWNER_NAME: "Sofiat Adedeji",
  BRAND: "Sofira Blueprints",
  SITE_URL: "https://sofira-blueprints.github.io",
  WHATSAPP_DISPLAY: "+234 701 243 2052",
  WHATSAPP_LINK: "https://wa.me/2347012432052",
  CALENDAR_ID: "primary",            // or the ID of a dedicated "Client calls" calendar
  TIMEZONE: "Africa/Lagos",          // your time zone
  WORK_DAYS: [1, 2, 3, 4, 5],        // 0 = Sunday … 6 = Saturday (must match config.js)
  DAY_START_HOUR: 9,
  DAY_END_HOUR: 18,
  MIN_NOTICE_HOURS: 12,
  WINDOW_DAYS: 31,
  FALLBACK_MEETING_LINK: ""          // optional: your Zoom / personal Meet link if Meet can't be auto-created
};

const SHEETS = {
  Bookings: ["Received", "Status", "Name", "Email", "Company", "Phone / WhatsApp", "Call type", "Start (your time)", "Start (client time)", "Client time zone", "Duration (min)", "Website", "Platform", "Goals", "Meeting link", "Event ID", "Reminder 24h sent", "Reminder 1h sent", "Start ISO", "Page"],
  Messages: ["Received", "Status", "Name", "Email", "Topic", "Preferred reply", "Phone / WhatsApp", "Message", "Client time zone", "Client local time", "Page"],
  Subscribers: ["Subscribed", "Email", "Time zone", "Page"]
};

/* ------------------------------------------------------------------ */
/*  One-time setup: run this once from the editor (Run ▸ setup)        */
/* ------------------------------------------------------------------ */
function setup() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  Object.keys(SHEETS).forEach(function (name) {
    let sh = ss.getSheetByName(name);
    if (!sh) sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, SHEETS[name].length).setValues([SHEETS[name]]).setFontWeight("bold").setBackground("#0A1430").setFontColor("#E5BC55");
    sh.setFrozenRows(1);
  });
  const def = ss.getSheetByName("Sheet1"); if (def && ss.getSheets().length > 1) ss.deleteSheet(def);
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === "sendReminders") ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger("sendReminders").timeBased().everyMinutes(15).create();
  Logger.log("Setup complete. Now deploy as a Web app (see SETUP.md).");
}

/* ------------------------------------------------------------------ */
/*  GET  → availability (busy times) for the website calendar          */
/* ------------------------------------------------------------------ */
function doGet(e) {
  const p = (e && e.parameter) || {};
  if (p.action === "availability") {
    const from = p.from ? new Date(p.from) : new Date();
    let to = p.to ? new Date(p.to) : new Date(Date.now() + CONFIG.WINDOW_DAYS * 864e5);
    if (to - from > 62 * 864e5) to = new Date(from.getTime() + 62 * 864e5);
    const events = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID).getEvents(from, to);
    const busy = events.filter(function (ev) { return ev.getTransparency ? String(ev.getTransparency()) !== "TRANSPARENT" : true; })
      .map(function (ev) { return { start: ev.getStartTime().toISOString(), end: ev.getEndTime().toISOString() }; });
    return json({ ok: true, busy: busy });
  }
  return json({ ok: true, service: CONFIG.BRAND + " automation", time: new Date().toISOString() });
}

/* ------------------------------------------------------------------ */
/*  POST → booking | message | subscribe                               */
/* ------------------------------------------------------------------ */
function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    lock.waitLock(20000);
    const d = JSON.parse((e && e.postData && e.postData.contents) || "{}");
    if (d.company_website) return json({ ok: true }); // honeypot
    if (d.type === "booking") return json(handleBooking(d));
    if (d.type === "message") return json(handleMessage(d));
    if (d.type === "subscribe") return json(handleSubscribe(d));
    return json({ ok: false, error: "unknown-type" });
  } catch (err) {
    console.error(err);
    return json({ ok: false, error: "server-error" });
  } finally {
    try { lock.releaseLock(); } catch (x) {}
  }
}

/* ------------------------------ booking ----------------------------- */
function handleBooking(d) {
  if (!validEmail(d.email) || !d.name || !d.start || !d.end) return { ok: false, error: "invalid" };
  const start = new Date(d.start), end = new Date(d.end), now = new Date();
  const mins = (end - start) / 60000;
  if (isNaN(start) || isNaN(end) || mins < 15 || mins > 120) return { ok: false, error: "invalid-time" };
  if (start - now < CONFIG.MIN_NOTICE_HOURS * 3600e3 - 5 * 60e3 || start - now > CONFIG.WINDOW_DAYS * 864e5) return { ok: false, error: "outside-window" };
  const dow = Number(Utilities.formatDate(start, CONFIG.TIMEZONE, "u")) % 7; // u: 1=Mon..7=Sun
  const startH = Number(Utilities.formatDate(start, CONFIG.TIMEZONE, "H")) + Number(Utilities.formatDate(start, CONFIG.TIMEZONE, "m")) / 60;
  const endH = startH + mins / 60;
  if (CONFIG.WORK_DAYS.indexOf(dow) < 0 || startH < CONFIG.DAY_START_HOUR || endH > CONFIG.DAY_END_HOUR) return { ok: false, error: "outside-hours" };

  const cal = CalendarApp.getCalendarById(CONFIG.CALENDAR_ID);
  if (cal.getEvents(start, end).length > 0) return { ok: false, error: "slot-taken" };

  const title = (d.callLabel || "Discovery Call") + " — " + d.name + (d.company ? " (" + d.company + ")" : "");
  const desc = [
    "Booked via " + CONFIG.SITE_URL,
    "Name: " + d.name, "Email: " + d.email,
    d.company ? "Company: " + d.company : "", d.phone ? "WhatsApp/phone: " + d.phone : "",
    d.website ? "Website: " + d.website : "", d.platform ? "Platform: " + d.platform : "",
    "Client time zone: " + (d.timezone || ""), "", "Goals:", d.goals || ""
  ].filter(String).join("\n");

  let meetLink = "", eventId = "";
  try {
    // Requires the "Google Calendar API" advanced service (see SETUP.md) — creates a Meet link.
    const ev = Calendar.Events.insert({
      summary: title, description: desc,
      start: { dateTime: start.toISOString() }, end: { dateTime: end.toISOString() },
      attendees: [{ email: d.email, displayName: d.name }],
      conferenceData: { createRequest: { requestId: Utilities.getUuid(), conferenceSolutionKey: { type: "hangoutsMeet" } } },
      reminders: { useDefault: false, overrides: [{ method: "email", minutes: 1440 }, { method: "popup", minutes: 60 }, { method: "popup", minutes: 10 }] }
    }, CONFIG.CALENDAR_ID, { conferenceDataVersion: 1, sendUpdates: "all" });
    meetLink = ev.hangoutLink || ""; eventId = ev.id;
  } catch (err) {
    const ev = cal.createEvent(title, start, end, { description: desc + (CONFIG.FALLBACK_MEETING_LINK ? "\n\nJoin: " + CONFIG.FALLBACK_MEETING_LINK : ""), guests: d.email, sendInvites: true });
    ev.addEmailReminder(1440); ev.addPopupReminder(60);
    eventId = ev.getId(); meetLink = CONFIG.FALLBACK_MEETING_LINK || "";
  }

  const tz = safeTz(d.timezone);
  const ownerTime = Utilities.formatDate(start, CONFIG.TIMEZONE, "EEE d MMM yyyy, HH:mm") + " (Lagos)";
  const clientTime = Utilities.formatDate(start, tz, "EEE d MMM yyyy, HH:mm") + " (" + tz + ")";
  sheet("Bookings").appendRow([new Date(), "Booked", d.name, d.email, d.company || "", d.phone || "", d.callLabel || "", ownerTime, clientTime, tz, mins, d.website || "", d.platform || "", d.goals || "", meetLink, eventId, "", "", start.toISOString(), d.page || ""]);

  // Confirmation to the client
  const first = String(d.name).split(" ")[0];
  MailApp.sendEmail({
    to: d.email, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.OWNER_NAME + " · " + CONFIG.BRAND,
    subject: "Confirmed: your " + (d.callLabel || "call") + " on " + Utilities.formatDate(start, tz, "EEE d MMM 'at' HH:mm"),
    htmlBody: shell("You're booked, " + esc(first) + "!",
      "<p>Thanks for booking a <b>" + esc(d.callLabel || "call") + "</b> with me. Here are the details:</p>" +
      table([["When", esc(clientTime)], ["Duration", mins + " minutes"], ["Where", meetLink ? "<a href='" + meetLink + "'>" + meetLink + "</a>" : "The meeting link is in your calendar invite."]]) +
      (d.audit ? "<p>Because you chose the <b>free audit</b>, I'll review your setup before we meet and bring a prioritised list of fixes.</p>" : "") +
      "<p>You'll receive reminders 24 hours and 1 hour before the call. Need to reschedule? Just reply to this email or message me on <a href='" + CONFIG.WHATSAPP_LINK + "'>WhatsApp</a>.</p>" +
      "<p>Talk soon,<br>Sofiat</p>")
  });

  // Alert to you
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL, replyTo: d.email, name: CONFIG.BRAND + " website",
    subject: "🗓 New booking: " + d.name + " — " + ownerTime,
    htmlBody: shell("New " + esc(d.callLabel || "call") + " booked",
      table([["Name", esc(d.name)], ["Email", "<a href='mailto:" + esc(d.email) + "'>" + esc(d.email) + "</a>"], ["Company", esc(d.company)], ["WhatsApp / phone", d.phone ? "<a href='https://wa.me/" + String(d.phone).replace(/\D/g, "") + "'>" + esc(d.phone) + "</a>" : ""], ["Your time", esc(ownerTime)], ["Client time", esc(clientTime)], ["Website", esc(d.website)], ["Platform", esc(d.platform)], ["Meeting", meetLink ? "<a href='" + meetLink + "'>" + meetLink + "</a>" : "See calendar"]]) +
      "<p><b>Goals:</b><br>" + esc(d.goals).replace(/\n/g, "<br>") + "</p>")
  });

  return { ok: true, meetLink: meetLink, eventId: eventId };
}

/* ------------------------------ message ----------------------------- */
function handleMessage(d) {
  if (!validEmail(d.email) || !d.name || !d.message) return { ok: false, error: "invalid" };
  const tz = safeTz(d.timezone);
  sheet("Messages").appendRow([new Date(), "New", d.name, d.email, d.topic || "", d.replyVia || "email", d.phone || "", d.message, tz, d.localTime || "", d.page || ""]);
  MailApp.sendEmail({
    to: CONFIG.OWNER_EMAIL, replyTo: d.email, name: CONFIG.BRAND + " website",
    subject: "✉️ " + (d.topic || "New message") + " — " + d.name,
    htmlBody: shell("New message from " + esc(d.name),
      table([["Email", "<a href='mailto:" + esc(d.email) + "'>" + esc(d.email) + "</a>"], ["Topic", esc(d.topic)], ["Prefers reply by", esc(d.replyVia)], ["WhatsApp / phone", d.phone ? "<a href='https://wa.me/" + String(d.phone).replace(/\D/g, "") + "'>" + esc(d.phone) + "</a>" : ""], ["Their time zone", esc(tz) + " (now " + Utilities.formatDate(new Date(), tz, "HH:mm") + ")"]]) +
      "<p>" + esc(d.message).replace(/\n/g, "<br>") + "</p>")
  });
  MailApp.sendEmail({
    to: d.email, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.OWNER_NAME + " · " + CONFIG.BRAND,
    subject: "Got your message — I'll reply within 24 hours",
    htmlBody: shell("Thanks, " + esc(String(d.name).split(" ")[0]) + "!",
      "<p>Your message about <b>" + esc(d.topic || "your project") + "</b> has arrived safely. I'll get back to you within 24 hours" + (d.replyVia === "whatsapp" ? " on WhatsApp" : d.replyVia === "call" ? " to arrange a quick call" : "") + ".</p>" +
      "<p>Want to skip the back-and-forth? <a href='" + CONFIG.SITE_URL + "/contact.html#book'>Book a free audit call</a> at a time that suits you.</p><p>Sofiat</p>")
  });
  return { ok: true };
}

/* ----------------------------- subscribe ---------------------------- */
function handleSubscribe(d) {
  if (!validEmail(d.email)) return { ok: false, error: "invalid" };
  const sh = sheet("Subscribers");
  const existing = sh.getLastRow() > 1 ? sh.getRange(2, 2, sh.getLastRow() - 1, 1).getValues().map(function (r) { return String(r[0]).toLowerCase(); }) : [];
  if (existing.indexOf(String(d.email).toLowerCase()) < 0) {
    sh.appendRow([new Date(), d.email, safeTz(d.timezone), d.page || ""]);
    MailApp.sendEmail({
      to: d.email, replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.OWNER_NAME + " · " + CONFIG.BRAND,
      subject: "Welcome to Blueprint Notes",
      htmlBody: shell("Welcome to Blueprint Notes",
        "<p>Twice a month you'll get one practical email or CRM automation idea you can use straight away.</p>" +
        "<p>Start here: <a href='" + CONFIG.SITE_URL + "/blog/klaviyo-flows-every-ecommerce-store-needs.html'>the 6 flows every store needs</a> and <a href='" + CONFIG.SITE_URL + "/blog/spf-dkim-dmarc-email-deliverability-guide.html'>the deliverability checklist</a>.</p>" +
        "<p style='color:#56617f;font-size:12px'>Not for you? Reply with “unsubscribe” and you'll be removed.</p>")
    });
  }
  return { ok: true };
}

/* ------------------------- reminders (trigger) ---------------------- */
function sendReminders() {
  const sh = sheet("Bookings"); const last = sh.getLastRow(); if (last < 2) return;
  const h = SHEETS.Bookings, rows = sh.getRange(2, 1, last - 1, h.length).getValues(), now = Date.now();
  const C = function (n) { return h.indexOf(n); };
  rows.forEach(function (r, i) {
    if (r[C("Status")] !== "Booked") return;
    const start = new Date(r[C("Start ISO")]).getTime(); if (isNaN(start) || start < now) return;
    const until = start - now, tz = safeTz(r[C("Client time zone")]), rowNo = i + 2;
    const link = r[C("Meeting link")] ? "<a href='" + r[C("Meeting link")] + "'>" + r[C("Meeting link")] + "</a>" : "the link in your calendar invite";
    const when = Utilities.formatDate(new Date(start), tz, "EEE d MMM, HH:mm") + " (" + tz + ")";
    if (!r[C("Reminder 24h sent")] && until <= 24 * 3600e3 && until > 2 * 3600e3) {
      MailApp.sendEmail({ to: r[C("Email")], replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.OWNER_NAME + " · " + CONFIG.BRAND, subject: "Reminder: our call tomorrow — " + when,
        htmlBody: shell("See you tomorrow", "<p>A quick reminder of our <b>" + esc(r[C("Call type")]) + "</b> on <b>" + esc(when) + "</b>.</p><p>Join via " + link + ".</p><p>If anything changes, just reply to this email.</p>") });
      sh.getRange(rowNo, C("Reminder 24h sent") + 1).setValue(new Date());
    }
    if (!r[C("Reminder 1h sent")] && until <= 75 * 60e3) {
      MailApp.sendEmail({ to: r[C("Email")], replyTo: CONFIG.OWNER_EMAIL, name: CONFIG.OWNER_NAME + " · " + CONFIG.BRAND, subject: "Starting in about 1 hour: our call at " + Utilities.formatDate(new Date(start), tz, "HH:mm"),
        htmlBody: shell("Starting soon", "<p>Our call starts at <b>" + esc(when) + "</b>.</p><p>Join via " + link + ".</p>") });
      sh.getRange(rowNo, C("Reminder 1h sent") + 1).setValue(new Date());
    }
  });
}

/* ------------------------------ helpers ----------------------------- */
function json(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
function sheet(n) { const ss = SpreadsheetApp.getActiveSpreadsheet(); let s = ss.getSheetByName(n); if (!s) { setup(); s = ss.getSheetByName(n); } return s; }
function validEmail(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e || "").trim()); }
function esc(s) { return String(s == null ? "" : s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;"); }
function safeTz(tz) { try { Utilities.formatDate(new Date(), String(tz || ""), "H"); return tz ? String(tz) : CONFIG.TIMEZONE; } catch (e) { return CONFIG.TIMEZONE; } }
function table(rows) {
  return "<table style='border-collapse:collapse;width:100%;margin:16px 0'>" + rows.filter(function (r) { return r[1]; }).map(function (r) {
    return "<tr><td style='padding:8px 12px;border-bottom:1px solid #e6e2d6;color:#56617f;font-size:13px;width:150px'>" + r[0] + "</td><td style='padding:8px 12px;border-bottom:1px solid #e6e2d6;font-size:14px'>" + r[1] + "</td></tr>";
  }).join("") + "</table>";
}
function shell(title, body) {
  return "<div style='background:#f6f4ee;padding:24px 12px;font-family:Segoe UI,Helvetica,Arial,sans-serif;color:#0a1430'>" +
    "<div style='max-width:560px;margin:0 auto;background:#fff;border-radius:16px;overflow:hidden;border:1px solid #e6e2d6'>" +
    "<div style='background:#0a1430;padding:20px 24px;color:#eef2fb'><b style='font-size:20px;letter-spacing:-.5px'>Sofira</b> <span style='color:#e5bc55;font-size:11px;letter-spacing:3px'>BLUEPRINTS</span></div>" +
    "<div style='padding:24px;line-height:1.6;font-size:15px'><h1 style='font-size:22px;margin:0 0 12px'>" + title + "</h1>" + body + "</div>" +
    "<div style='padding:16px 24px;background:#faf8f3;color:#56617f;font-size:12px'>" + CONFIG.BRAND + " · Email marketing &amp; CRM automation · <a href='" + CONFIG.SITE_URL + "' style='color:#1a43b5'>" + CONFIG.SITE_URL.replace("https://", "") + "</a> · WhatsApp " + CONFIG.WHATSAPP_DISPLAY + "</div>" +
    "</div></div>";
}
