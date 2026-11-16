# Wholesale Ludhiana — wholesale store, bulk calculator & admin

*Everything Wholesale. One Store. Best Prices.*

A complete single-seller wholesale e-commerce site. It is built on the same stack as the
Ovenroma Bakers and Gluten Free Delhi sites (this code started as a copy of Ovenroma Bakers):
**Cloudflare Workers** (server-rendered pages + API), **D1** (database) and **Razorpay** (payments).
There is no marketplace, supplier or vendor functionality — one administrator runs everything.

## What's included

| Area | Details |
|---|---|
| Storefront | Home (hero, categories, best sellers, deals, new arrivals, bakery specials, langar band, seasonal, why us, testimonials, WhatsApp), 8 categories with subcategory pages, search, sort, pagination, product pages, cart, checkout, order page, wishlist, customer login, about, contact, policies |
| Products | Photos, description, category + subcategory, wholesale price, MRP, unit, minimum order quantity, **quantity price slabs**, stock, specifications, variations, Add to Cart / Buy Now / WhatsApp Enquiry |
| Checkout | Server-side pricing, quantity slabs, GST, delivery charge, coupons, shipping + billing address, GSTIN, order notes. Payment: Razorpay (order created and signature verified on the server, plus signed webhook), UPI, cash on delivery, bank transfer — each can be switched on/off |
| Bulk orders | `/langar-bhandara-bulk-orders` calculator: quantities, slab pricing, subtotal, GST, delivery, grand total, submit order, WhatsApp enquiry |
| Admin (`/admin`) | Dashboard (today / month revenue, order counts, low-stock alerts, best sellers), products (add / edit / delete, photo upload, slabs, variations, stock, CSV import + export), categories, orders (statuses, customer details, printable GST invoice, CSV report), customers, coupons, banners & offers, testimonials, enquiries, sales reports, settings (WhatsApp number, GST, delivery, payment methods, homepage text, policy pages, SEO / Google verification) |
| SEO | Unique titles and descriptions, canonical URLs, Open Graph, `sitemap.xml` (categories, subcategories, products, images), `robots.txt`, Product / Breadcrumb / ItemList / FAQ / WholesaleStore schema, image alt text, Google Search Console verification field |
| Security | Admin password stored only as an scrypt hash, httpOnly session cookie, CSRF token on every admin change, login throttling, rate limits, strict Content-Security-Policy, parameterised SQL, escaped HTML. The database is reachable only through this Worker, and every add / edit / delete goes through the admin check |

## Please review before going live

* **Prices.** The MARS cosmetics use the prices from your spreadsheet. The Frontier biscuits and all
  textile / garment items had no prices in the spreadsheets, so they show **“Price on request”**
  (WhatsApp enquiry) until you set a price. The ten Langar & Bhandara items (kulcha, samosa, plates…)
  have **placeholder prices and slabs** — change them in **Admin → Langar & Bulk prices**.
* **GST.** Seeded as 18% for cosmetics and 5% for everything else. Confirm the rates with your accountant.
* **Photos** are loaded from the links in your spreadsheets (the brands' own servers). Upload your own
  photos in **Admin → Products → Edit** whenever you can — a link stops working if that site removes the photo.
* **Delivery charge** is ₹0 until you set it in **Admin → Settings → Delivery charges**.
* **Testimonials:** none are published. Add real ones in **Admin → Testimonials**.
* **WhatsApp** is set to 918727002486 (the number on glutenfreedelhi.com). Change it in **Admin → Settings**.

## Deploying to Cloudflare (account: wholesaleludhiana)

1. Cloudflare dashboard → **Workers & Pages → Create → Import a repository** → choose this GitHub repo.
   Build command: *(empty)*. Deploy command: `npm run deploy`.
   The first deploy creates the `wholesaleludhiana` D1 database and loads all categories and products.
2. Worker → **Settings → Variables and Secrets**:

   | Name | Type | Value |
   |---|---|---|
   | `ADMIN_PASSWORD_HASH` | Secret | output of `npm run hash-password -- 'your long password'` |
   | `RAZORPAY_KEY_ID` | Variable | `rzp_live_…` |
   | `RAZORPAY_KEY_SECRET` | Secret | the matching key secret |
   | `RAZORPAY_WEBHOOK_SECRET` | Secret | the secret you type when creating the webhook |
   | `SITE_URL` | Variable | e.g. `https://www.wholesaleludhiana.com` |

3. Razorpay dashboard → Webhooks → add `https://<your-domain>/api/razorpay-webhook` with events
   `payment.captured`, `order.paid`, `payment.failed`.
4. Sign in at `/admin` (user `admin`), open **Settings → Payment methods → Check Razorpay connection**.
5. Google Search Console → add the site → “HTML tag” → paste the code in **Admin → Settings → Google & SEO**,
   then submit `/sitemap.xml`.

Until the Razorpay keys are set, “Pay online” is simply not offered at checkout; COD and WhatsApp still work.

## Local development and tests

```bash
npm install
cp .dev.vars.example .dev.vars     # test keys for local use
npm run db:migrate:local
npm run dev                         # http://localhost:8787  (admin password in .dev.vars.example)
npm test                            # unit tests + Playwright end-to-end tests (desktop + mobile)
```

The end-to-end tests run the real Worker with a local database and a local stand-in for the Razorpay
Orders API (`tests/e2e/mock-razorpay.mjs`); the signature checks are the real ones.

`scripts/build_seed.py` rebuilds `migrations/0002_seed.sql` from the three catalogue spreadsheets.
