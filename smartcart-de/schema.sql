-- SmartCart DE Datenbank-Schema für Cloudflare D1 (SQLite)

DROP TABLE IF EXISTS shopping_list;
DROP TABLE IF EXISTS user_settings;
DROP TABLE IF EXISTS store_prices;
DROP TABLE IF EXISTS products;

CREATE TABLE products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  unit TEXT NOT NULL,
  base_unit TEXT NOT NULL,
  base_factor REAL NOT NULL
);

CREATE TABLE store_prices (
  product_id TEXT NOT NULL,
  store TEXT NOT NULL, -- 'dm', 'rewe', 'lidl', 'aldi'
  price REAL,          -- NULL wenn Artikel im Markt nicht verfügbar
  promo INTEGER DEFAULT 0,
  promo_label TEXT,
  external_id TEXT,    -- DAN bei dm, Product-ID bei REWE
  brand_name TEXT,
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (product_id, store),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

CREATE TABLE user_settings (
  user_key TEXT PRIMARY KEY,
  plz TEXT NOT NULL DEFAULT '37308',
  strategy TEXT NOT NULL DEFAULT 'split',
  updated_at TEXT DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE shopping_list (
  user_key TEXT NOT NULL,
  product_id TEXT NOT NULL,
  qty INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (user_key, product_id),
  FOREIGN KEY (product_id) REFERENCES products(id)
);

-- Initiale Standard-Einstellungen
INSERT INTO user_settings (user_key, plz, strategy) VALUES ('default', '37308', 'split');

-- Initialer Produktkatalog (Normalisierte Grundprodukte)
INSERT INTO products (id, name, category, unit, base_unit, base_factor) VALUES
  ('hafermilch', 'Bio Haferdrink Barista', 'Milch & Ersatz', '1 L', 'L', 1.0),
  ('magerquark', 'Speisequark Magerstufe', 'Kühlregal', '500 g', 'kg', 0.5),
  ('tomaten_passiert', 'Passierte Tomaten', 'Vorrat', '500 g', 'kg', 0.5),
  ('spaghetti', 'Spaghetti Hartweizengrieß', 'Vorrat', '500 g', 'kg', 0.5),
  ('toilettenpapier', 'Toilettenpapier 3-lagig', 'Drogerie', '10 Rollen', 'Rolle', 10.0),
  ('spuelmaschinen_tabs', 'Geschirrspül-Tabs All-in-1', 'Drogerie', '40 Stück', 'Tab', 40.0),
  ('bananen', 'Bio Bananen', 'Obst & Gemüse', '1 kg', 'kg', 1.0),
  ('kaffee_bohnen', 'Caffè Crema Ganze Bohnen', 'Getränke', '1 kg', 'kg', 1.0),
  ('duschgel', 'Pflegedusche Sensitiv', 'Drogerie', '300 ml', 'L', 0.3),
  ('butter', 'Deutsche Markenbutter', 'Kühlregal', '250 g', 'kg', 0.25),
  ('eier_bio', 'Bio Eier Freilandhaltung', 'Kühlregal', '10 Stück', 'Stück', 10.0),
  ('haferflocken', 'Kernige Haferflocken', 'Vorrat', '500 g', 'kg', 0.5);

-- Initiale Preise & Händler-IDs (DANs & REWE-IDs)
INSERT INTO store_prices (product_id, store, price, promo, promo_label, external_id, brand_name) VALUES
  ('hafermilch', 'dm', 1.45, 0, NULL, '734912', 'dmBio Haferdrink Barista'),
  ('hafermilch', 'rewe', 1.79, 0, NULL, '8412093', 'REWE Bio Haferdrink'),
  ('hafermilch', 'lidl', 1.15, 1, 'KW-Angebot -20%', NULL, 'Vemondo Bio Haferdrink'),
  ('hafermilch', 'aldi', 1.29, 0, NULL, NULL, 'MyVay Bio Haferdrink'),

  ('magerquark', 'dm', NULL, 0, NULL, NULL, NULL),
  ('magerquark', 'rewe', 1.39, 0, NULL, '1049281', 'ja! Speisequark Magerstufe'),
  ('magerquark', 'lidl', 1.35, 0, NULL, NULL, 'Milbona Speisequark'),
  ('magerquark', 'aldi', 1.19, 1, 'Super-Wochenendpreis', NULL, 'Milsani Speisequark'),

  ('tomaten_passiert', 'dm', 0.95, 0, NULL, '492018', 'dmBio Passierte Tomaten'),
  ('tomaten_passiert', 'rewe', 0.89, 0, NULL, '2049182', 'ja! Passierte Tomaten'),
  ('tomaten_passiert', 'lidl', 0.85, 0, NULL, NULL, 'Nostia Passierte Tomaten'),
  ('tomaten_passiert', 'aldi', 0.85, 0, NULL, NULL, 'Cucina Passierte Tomaten'),

  ('spaghetti', 'dm', 1.15, 0, NULL, '582910', 'dmBio Spaghetti'),
  ('spaghetti', 'rewe', 0.79, 0, NULL, '3910482', 'ja! Spaghetti'),
  ('spaghetti', 'lidl', 0.79, 0, NULL, NULL, 'Combino Spaghetti'),
  ('spaghetti', 'aldi', 0.69, 1, 'Wochenaktion', NULL, 'Cucina Spaghetti'),

  ('toilettenpapier', 'dm', 3.45, 0, NULL, '129482', 'Sanft&Sicher 3-lagig 10x200'),
  ('toilettenpapier', 'rewe', 3.79, 0, NULL, '5019283', 'ja! Toilettenpapier 3-lagig'),
  ('toilettenpapier', 'lidl', 3.45, 0, NULL, NULL, 'Floralys Toilettenpapier'),
  ('toilettenpapier', 'aldi', 3.39, 0, NULL, NULL, 'Kokett Toilettenpapier'),

  ('spuelmaschinen_tabs', 'dm', 3.95, 0, NULL, '882714', 'Denkmit Multi-Power Tabs'),
  ('spuelmaschinen_tabs', 'rewe', 4.49, 0, NULL, '6192834', 'ja! Geschirrspültabs'),
  ('spuelmaschinen_tabs', 'lidl', 3.79, 1, 'App-Preis', NULL, 'W5 All-in-1 Tabs'),
  ('spuelmaschinen_tabs', 'aldi', 3.99, 0, NULL, NULL, 'Alio All-in-1 Tabs'),

  ('bananen', 'dm', NULL, 0, NULL, NULL, NULL),
  ('bananen', 'rewe', 1.69, 0, NULL, '7182930', 'REWE Bio Bananen lose'),
  ('bananen', 'lidl', 1.29, 1, 'Frische-Knaller', NULL, 'Bio Bananen Fairtrade'),
  ('bananen', 'aldi', 1.39, 0, NULL, NULL, 'Gut Bio Bananen'),

  ('kaffee_bohnen', 'dm', 11.95, 0, NULL, '651029', 'dmBio Caffè Crema 1000g'),
  ('kaffee_bohnen', 'rewe', 9.99, 1, 'Top-Angebot -28%', '8291045', 'Melitta BellaCrema 1kg'),
  ('kaffee_bohnen', 'lidl', 10.49, 0, NULL, NULL, 'Bellarom Caffè Crema'),
  ('kaffee_bohnen', 'aldi', 9.79, 0, NULL, NULL, 'Barissimo Caffè Crema'),

  ('duschgel', 'dm', 0.65, 0, NULL, '310492', 'Balea Pflegedusche Sensitiv'),
  ('duschgel', 'rewe', 0.75, 0, NULL, '9102834', 'today Duschgel Sensitiv'),
  ('duschgel', 'lidl', 0.65, 0, NULL, NULL, 'Cien Pflegedusche'),
  ('duschgel', 'aldi', 0.65, 0, NULL, NULL, 'Ombia Pflegedusche'),

  ('butter', 'dm', NULL, 0, NULL, NULL, NULL),
  ('butter', 'rewe', 1.99, 0, NULL, '4102938', 'ja! Deutsche Markenbutter'),
  ('butter', 'lidl', 1.79, 1, 'Wochenstart-Deal', NULL, 'Milbona Markenbutter'),
  ('butter', 'aldi', 1.89, 0, NULL, NULL, 'Milsani Markenbutter'),

  ('eier_bio', 'dm', NULL, 0, NULL, NULL, NULL),
  ('eier_bio', 'rewe', 3.49, 0, NULL, '5519283', 'REWE Bio Eier 10er'),
  ('eier_bio', 'lidl', 3.29, 0, NULL, NULL, 'Bio Eier 10 Stück'),
  ('eier_bio', 'aldi', 3.29, 0, NULL, NULL, 'Gut Bio Eier 10er'),

  ('haferflocken', 'dm', 0.95, 0, NULL, '441928', 'dmBio Haferflocken kernig'),
  ('haferflocken', 'rewe', 0.79, 0, NULL, '6619283', 'ja! Haferflocken kernig'),
  ('haferflocken', 'lidl', 0.79, 0, NULL, NULL, 'Crownfield Haferflocken'),
  ('haferflocken', 'aldi', 0.79, 0, NULL, NULL, 'Knusperone Haferflocken');

-- Initiale Beispiel-Einkaufsliste
INSERT INTO shopping_list (user_key, product_id, qty) VALUES
  ('default', 'hafermilch', 3),
  ('default', 'magerquark', 2),
  ('default', 'spaghetti', 2),
  ('default', 'toilettenpapier', 1),
  ('default', 'bananen', 1),
  ('default', 'kaffee_bohnen', 1),
  ('default', 'duschgel', 2);
