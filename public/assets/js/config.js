/* =====================================================================
   SITE SETTINGS — the only file you need to edit to switch on automation
   ---------------------------------------------------------------------
   backendUrl: paste the Google Apps Script "Web app" URL here after
   following backend/SETUP.md (ends with /exec). While it is empty, the
   booking and message forms fall back to opening the visitor's email app
   with everything pre-filled, so no lead is ever lost.
   ===================================================================== */
window.SOFIRA_CONFIG = {
  backendUrl: "",

  ownerEmail: "sofirablueprints@gmail.com",
  whatsapp: "2347012432052",

  /* Your working hours, in YOUR time zone (Lagos, UTC+1, no daylight saving) */
  ownerTimeZone: "Africa/Lagos",
  ownerUtcOffsetHours: 1,
  workDays: [1, 2, 3, 4, 5],        // 0 = Sunday … 6 = Saturday
  dayStartHour: 9,                  // first call can start at 09:00 Lagos
  dayEndHour: 18,                   // last call must END by 18:00 Lagos
  minNoticeHours: 12,               // earliest bookable slot from now
  bookingWindowDays: 30,            // how far ahead people can book

  callTypes: {
    discovery: { label: "Discovery Call", minutes: 30 },
    audit:     { label: "Free Audit + Discovery Call", minutes: 45 }
  }
};
