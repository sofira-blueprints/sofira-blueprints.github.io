# Sofira Blueprints website

A fast, animated, six-section website for Sofira Blueprints (email marketing and CRM automation):

- Home, Services, Case Studies (30 interactive projects), About, Blog (6 articles) and Contact
- Light and dark mode, with no frameworks to install

## Folder guide

| Folder / file | What it is |
|---|---|
| `public/` | **The finished website.** Upload the contents of this folder to any host (Netlify, Vercel, cPanel, GitHub Pages…). |
| `public/assets/js/config.js` | Settings: booking hours and the automation backend URL. |
| `src/pages/` | Page content (edit text here). |
| `src/partials/` | Shared header, footer and `<head>`. |
| `src/templates/case.html` | Layout used for every case-study page. |
| `data/cases.json` | **All 30 case studies.** Add, edit or reorder projects here. |
| `backend/` | Google Apps Script for bookings, the Sheet, reminders and email alerts. See `backend/SETUP.md`. |
| `build.ps1` | Rebuilds `public/` from `src/` and `data/`. |
| `serve.ps1` | Local preview server. |

## Edit, rebuild, preview

1. Edit files in `src/` or `data/cases.json`.
2. Rebuild:
   ```
   powershell -ExecutionPolicy Bypass -File build.ps1 -SiteUrl "https://your-domain.com"
   ```
3. Preview at http://localhost:8080:
   ```
   powershell -ExecutionPolicy Bypass -File serve.ps1
   ```

`-SiteUrl` sets canonical links, social previews and the sitemap. It defaults to `https://sofirablueprints.com`. Pass your real domain when you know it, and update the domain in `public/robots.txt` and `public/llms.txt` too.

## Adding a case study

Copy any block in `data/cases.json`, change the `slug` (it becomes the URL), text, `platforms`, `steps` and `results`, put screenshots in `public/assets/work/`, then rebuild. Step types: `trigger`, `email`, `wait`, `branch`, `action`, `sms`, `goal`, `tag`, `crm`, `webhook`, `ai`, `page`, `cart`.

## After you go live (SEO / AEO / GEO)

1. Submit `https://your-domain.com/sitemap.xml` in Google Search Console and Bing Webmaster Tools.
2. Keep publishing articles in `src/pages/blog/`. Each one has a quick-answer box, FAQs and structured data built in.
3. Add the site URL to your Upwork and LinkedIn profiles.
