-- Wholesale Ludhiana — D1 schema. Money is stored in paise (INTEGER); a NULL
-- price means "price on request" (cannot be added to the cart).

CREATE TABLE categories (
  slug            TEXT PRIMARY KEY,
  parent          TEXT REFERENCES categories(slug) ON UPDATE CASCADE ON DELETE CASCADE, -- NULL = main category
  name            TEXT NOT NULL,
  description     TEXT NOT NULL DEFAULT '',
  image           TEXT NOT NULL DEFAULT '',
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  sort            INTEGER NOT NULL DEFAULT 0,
  active          INTEGER NOT NULL DEFAULT 1
);
CREATE INDEX idx_categories_parent ON categories(parent, sort);

CREATE TABLE products (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  slug            TEXT NOT NULL UNIQUE,
  name            TEXT NOT NULL,
  category        TEXT NOT NULL REFERENCES categories(slug) ON UPDATE CASCADE,
  subcategory     TEXT REFERENCES categories(slug) ON UPDATE CASCADE ON DELETE SET NULL,
  brand           TEXT NOT NULL DEFAULT '',
  sku             TEXT NOT NULL DEFAULT '',
  description     TEXT NOT NULL DEFAULT '',
  unit            TEXT NOT NULL DEFAULT 'piece',   -- piece, dozen, kg, packet, box, metre, roll, set, carton
  moq             INTEGER NOT NULL DEFAULT 1,      -- minimum order quantity
  price_paise     INTEGER,                         -- wholesale price per unit; NULL = price on request
  mrp_paise       INTEGER,                         -- optional MRP (strike-through)
  tiers           TEXT NOT NULL DEFAULT '[]',      -- JSON [{min, price_paise}] quantity slabs
  gst_rate        REAL,                            -- percent; NULL = store default
  track_stock     INTEGER NOT NULL DEFAULT 0,
  stock           INTEGER NOT NULL DEFAULT 0,
  low_stock       INTEGER NOT NULL DEFAULT 10,     -- low-stock alert threshold
  image           TEXT NOT NULL DEFAULT '',
  gallery         TEXT NOT NULL DEFAULT '[]',      -- JSON array of extra image URLs
  specs           TEXT NOT NULL DEFAULT '[]',      -- JSON [{k, v}]
  variants        TEXT NOT NULL DEFAULT '[]',      -- JSON [{id, label, price_paise, available}]
  featured        INTEGER NOT NULL DEFAULT 0,      -- Best seller
  deal            INTEGER NOT NULL DEFAULT 0,      -- Wholesale deal
  is_new          INTEGER NOT NULL DEFAULT 0,      -- New arrival
  seasonal        INTEGER NOT NULL DEFAULT 0,      -- Seasonal collection
  bulk            INTEGER NOT NULL DEFAULT 0,      -- shown in the Langar & Bhandara calculator
  active          INTEGER NOT NULL DEFAULT 1,
  sort            INTEGER NOT NULL DEFAULT 0,
  sold            INTEGER NOT NULL DEFAULT 0,
  seo_title       TEXT NOT NULL DEFAULT '',
  seo_description TEXT NOT NULL DEFAULT '',
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX idx_products_category ON products(category, active, sort);
CREATE INDEX idx_products_sub ON products(subcategory, active);

CREATE TABLE orders (
  id                  INTEGER PRIMARY KEY AUTOINCREMENT,
  ref                 TEXT NOT NULL UNIQUE,
  kind                TEXT NOT NULL DEFAULT 'standard',  -- standard | bulk (Langar & Bhandara)
  status              TEXT NOT NULL DEFAULT 'pending',   -- pending | confirmed | processing | dispatched | delivered | cancelled
  payment_method      TEXT NOT NULL,                     -- razorpay | upi | cod | bank | confirm (bulk: pay after confirmation)
  payment_status      TEXT NOT NULL DEFAULT 'unpaid',    -- unpaid | awaiting | paid | failed | refunded
  customer_name       TEXT NOT NULL,
  phone               TEXT NOT NULL,
  email               TEXT NOT NULL DEFAULT '',
  business            TEXT NOT NULL DEFAULT '',
  gstin               TEXT NOT NULL DEFAULT '',
  address             TEXT NOT NULL,                     -- shipping address
  city                TEXT NOT NULL DEFAULT '',
  state               TEXT NOT NULL DEFAULT '',
  pincode             TEXT NOT NULL,
  billing             TEXT NOT NULL DEFAULT '{}',        -- JSON {address, city, state, pincode}; {} = same as shipping
  notes               TEXT NOT NULL DEFAULT '',
  event               TEXT NOT NULL DEFAULT '{}',        -- bulk orders: JSON {name, date, people}
  items               TEXT NOT NULL,                     -- JSON priced lines (server-side snapshot)
  subtotal_paise      INTEGER NOT NULL,
  discount_paise      INTEGER NOT NULL DEFAULT 0,
  coupon              TEXT NOT NULL DEFAULT '',
  gst_paise           INTEGER NOT NULL DEFAULT 0,
  gst_inclusive       INTEGER NOT NULL DEFAULT 0,
  shipping_paise      INTEGER NOT NULL DEFAULT 0,
  total_paise         INTEGER NOT NULL,
  razorpay_order_id   TEXT UNIQUE,
  razorpay_payment_id TEXT,
  failure_reason      TEXT NOT NULL DEFAULT '',
  stock_applied       INTEGER NOT NULL DEFAULT 0,
  account_id          INTEGER,
  admin_note          TEXT NOT NULL DEFAULT '',
  created_at          TEXT NOT NULL DEFAULT (datetime('now')),
  paid_at             TEXT
);
CREATE INDEX idx_orders_created ON orders(created_at);
CREATE INDEX idx_orders_phone ON orders(phone);
CREATE INDEX idx_orders_account ON orders(account_id);

CREATE TABLE coupons (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  code          TEXT NOT NULL UNIQUE,              -- stored upper-case
  description   TEXT NOT NULL DEFAULT '',
  type          TEXT NOT NULL DEFAULT 'percent',   -- percent | flat
  value         INTEGER NOT NULL DEFAULT 0,        -- percent (1-100) or paise
  min_paise     INTEGER NOT NULL DEFAULT 0,        -- minimum order subtotal
  max_paise     INTEGER,                           -- cap on a percent discount
  usage_limit   INTEGER,
  used          INTEGER NOT NULL DEFAULT 0,
  expires       TEXT NOT NULL DEFAULT '',          -- YYYY-MM-DD or ''
  active        INTEGER NOT NULL DEFAULT 1
);

-- Customer accounts (optional login to see past orders).
CREATE TABLE accounts (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  name          TEXT NOT NULL,
  phone         TEXT NOT NULL UNIQUE,              -- 10 digits
  email         TEXT NOT NULL DEFAULT '',
  password_hash TEXT NOT NULL,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE TABLE account_sessions (
  token_hash TEXT PRIMARY KEY,
  account_id INTEGER NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);

CREATE TABLE enquiries (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  type        TEXT NOT NULL,       -- contact | quote
  name        TEXT NOT NULL,
  phone       TEXT NOT NULL DEFAULT '',
  email       TEXT NOT NULL DEFAULT '',
  payload     TEXT NOT NULL DEFAULT '{}',
  status      TEXT NOT NULL DEFAULT 'new', -- new | contacted | closed
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE testimonials (
  id       INTEGER PRIMARY KEY AUTOINCREMENT,
  name     TEXT NOT NULL,
  location TEXT NOT NULL DEFAULT '',
  text     TEXT NOT NULL,
  rating   INTEGER NOT NULL DEFAULT 5,
  active   INTEGER NOT NULL DEFAULT 0,
  sort     INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE banners (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  placement TEXT NOT NULL DEFAULT 'offer', -- hero | offer
  title     TEXT NOT NULL,
  subtitle  TEXT NOT NULL DEFAULT '',
  image     TEXT NOT NULL DEFAULT '',
  cta_label TEXT NOT NULL DEFAULT '',
  cta_url   TEXT NOT NULL DEFAULT '',
  active    INTEGER NOT NULL DEFAULT 1,
  sort      INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE settings (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL  -- JSON
);

CREATE TABLE admin_sessions (
  token_hash TEXT PRIMARY KEY,   -- SHA-256 of the random session token
  csrf       TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE login_attempts (
  ip TEXT NOT NULL,
  at INTEGER NOT NULL
);
CREATE INDEX idx_login_attempts ON login_attempts(ip, at);

CREATE TABLE webhook_events (
  event_id    TEXT PRIMARY KEY,
  received_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Photos uploaded from the admin panel (resized in the browser, stored here, served at /media/<id>).
CREATE TABLE media (
  id           TEXT PRIMARY KEY,
  content_type TEXT NOT NULL,
  size         INTEGER NOT NULL,
  data         BLOB NOT NULL,
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
