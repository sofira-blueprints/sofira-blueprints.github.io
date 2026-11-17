# Switch on the booking & lead automation (about 10 minutes, free)

This connects the website's **Book a call**, **Send a message** and **newsletter** forms to your own Google account. Nothing is shared with anyone else, and everything lives in **your** Google Drive, Calendar and Gmail.

When it's on, every booking automatically:

- checks your Google Calendar is free at that time (busy times disappear from the website calendar)
- creates the calendar event with a **Google Meet link** and invites the client
- adds a row to your **Google Sheet** (Bookings tab)
- emails the client a branded confirmation, in **their** time zone
- emails **you** a "New booking" alert with all their details and a one-tap WhatsApp link
- sends the client **reminders 24 hours and 1 hour** before the call

Messages go to the **Messages** tab and to your inbox (just hit reply), and the sender gets an acknowledgement. Newsletter sign-ups go to the **Subscribers** tab with a welcome email.

---

## Step 1: Create the Google Sheet

1. Sign in to Google with **sofirablueprints@gmail.com**, the account whose calendar should receive bookings.
2. Go to <https://sheets.new> and name the sheet **Sofira Blueprints: Leads & Bookings**.

## Step 2: Add the script

1. In the sheet, open **Extensions → Apps Script**.
2. Delete the sample code, then copy everything from `backend/Code.gs` (this folder) and paste it in.
3. Check the `CONFIG` section at the top: email, time zone and working hours. They must match `public/assets/js/config.js`.
4. Click **Save**.

## Step 3: Turn on Google Meet links

1. In the Apps Script editor's left sidebar, click **Services (+)**.
2. Choose **Google Calendar API**, then click **Add**.

(If you skip this, bookings still work, but without an automatic Meet link. You can put a Zoom or personal Meet link in `FALLBACK_MEETING_LINK` instead.)

## Step 4: Run setup once

1. In the function dropdown at the top, choose **setup**, then click **Run**.
2. Google asks you to authorise. Click **Review permissions**, choose your account, then **Advanced → Go to project (unsafe) → Allow**. The "unsafe" warning appears because this is your own private script; it is not published.
3. Your sheet now has **Bookings**, **Messages** and **Subscribers** tabs, and a 15-minute reminder timer is running.

## Step 5: Publish it as a web app

1. Click **Deploy → New deployment**.
2. Click the gear icon, then choose **Web app**.
3. Set **Execute as:** *Me* and **Who has access:** *Anyone*.
4. Click **Deploy**, then copy the **Web app URL**. It ends in `/exec`.

## Step 6: Connect the website

1. Open `public/assets/js/config.js`.
2. Paste the URL between the quotes: `backendUrl: "https://script.google.com/macros/s/XXXX/exec",`
3. Save the file and upload the site again. You don't need to re-run the build for this file.

## Step 7: Test it

1. Open your live site and go to **Contact → Book a call**. Pick a time and book it using a second email address of yours.
2. Check that:
   - you received the "New booking" email
   - the client email received a confirmation and a calendar invite
   - the event is in your calendar
   - a row appeared in the sheet
3. Delete the test event and row afterwards.

---

### Changing things later

- **Working hours or days:** update `CONFIG` in Apps Script **and** `config.js` on the website.
- **After editing the script:** go to **Deploy → Manage deployments → Edit (pencil) → Version: New version → Deploy**. The URL stays the same.
- **Cancel or reschedule a booking:** change it in Google Calendar; the client is notified automatically. To stop its reminder emails, set the row's **Status** to `Cancelled` in the sheet.
- **Email limits:** a free Gmail account can send about 100 automated emails a day, which is plenty for a consulting business. Google Workspace allows more.

### Using it with Claude

Because every lead lands in a Google Sheet, you can later connect Google Drive to Claude and ask questions like *"Which bookings this month chose the free audit?"* or *"Draft follow-ups for everyone who messaged about Klaviyo"*.
