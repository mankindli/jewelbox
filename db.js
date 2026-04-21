const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');
const path = require('path');
const config = require('./config');

const dbPath = path.join(__dirname, 'jewelbox.db');
const db = new Database(dbPath);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    nickname TEXT NOT NULL DEFAULT '',
    role TEXT NOT NULL DEFAULT 'user',
    status INTEGER NOT NULL DEFAULT 1,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS api_endpoints (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    base_url TEXT NOT NULL,
    api_key TEXT NOT NULL,
    model TEXT NOT NULL,
    model_type TEXT NOT NULL DEFAULT 'image',
    status TEXT NOT NULL DEFAULT 'online',
    priority INTEGER NOT NULL DEFAULT 0,
    fail_count INTEGER NOT NULL DEFAULT 0,
    last_fail_at DATETIME,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS global_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    key TEXT NOT NULL,
    value TEXT NOT NULL,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, key),
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS projects (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    jewelry_type TEXT NOT NULL,
    target_country TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    resolution TEXT NOT NULL DEFAULT '1024x1024',
    status TEXT NOT NULL DEFAULT 'draft',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_projects_user ON projects(user_id);

  CREATE TABLE IF NOT EXISTS design_nodes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    parent_node_id INTEGER,
    depth INTEGER NOT NULL DEFAULT 0,
    node_type TEXT NOT NULL,
    base_prompt TEXT NOT NULL DEFAULT '',
    adjustment_desc TEXT,
    selected_image_id INTEGER,
    status TEXT NOT NULL DEFAULT 'pending',
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
    FOREIGN KEY (parent_node_id) REFERENCES design_nodes(id)
  );
  CREATE INDEX IF NOT EXISTS idx_nodes_project ON design_nodes(project_id);
  CREATE INDEX IF NOT EXISTS idx_nodes_parent ON design_nodes(parent_node_id);

  CREATE TABLE IF NOT EXISTS generated_images (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id INTEGER NOT NULL,
    slot_index INTEGER NOT NULL,
    variation_prompt TEXT NOT NULL DEFAULT '',
    image_path TEXT,
    status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    model TEXT,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (node_id) REFERENCES design_nodes(id) ON DELETE CASCADE
  );
  CREATE INDEX IF NOT EXISTS idx_images_node ON generated_images(node_id);

  CREATE TABLE IF NOT EXISTS suggestion_cards (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    project_id INTEGER NOT NULL,
    node_id INTEGER,
    card_text TEXT NOT NULL,
    selected INTEGER NOT NULL DEFAULT 0,
    sort_order INTEGER NOT NULL DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
  );
`);

// Seed default admin
const adminExists = db.prepare('SELECT id FROM users WHERE username = ?').get('admin');
if (!adminExists) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare('INSERT INTO users (username, password, nickname, role) VALUES (?, ?, ?, ?)').run('admin', hash, '管理员', 'admin');
}

// Seed default settings
const defaultSettings = {
  jewelry_types: JSON.stringify([
    { id: 'ring', label: '戒指' },
    { id: 'earring', label: '耳环' },
    { id: 'necklace', label: '项链' },
    { id: 'bracelet', label: '手链' },
    { id: 'brooch', label: '胸针' },
    { id: 'pendant', label: '吊坠' }
  ]),
  countries: JSON.stringify([
    { id: 'CN', label: '中国' },
    { id: 'JP', label: '日本' },
    { id: 'US', label: '美国' },
    { id: 'BR', label: '巴西' },
    { id: 'AE', label: '阿联酋' },
    { id: 'IN', label: '印度' },
    { id: 'FR', label: '法国' },
    { id: 'IT', label: '意大利' },
    { id: 'KR', label: '韩国' },
    { id: 'TH', label: '泰国' }
  ]),
  resolutions: JSON.stringify([
    { id: '512x512', label: '512×512' },
    { id: '1024x1024', label: '1024×1024 (推荐)' },
    { id: '1536x1536', label: '1536×1536' }
  ])
};

const upsertSetting = db.prepare('INSERT OR IGNORE INTO global_settings (key, value) VALUES (?, ?)');
for (const [key, value] of Object.entries(defaultSettings)) {
  upsertSetting.run(key, value);
}

// Seed default endpoint if configured
if (config.defaultEndpoint.apiKey) {
  const epExists = db.prepare('SELECT id FROM api_endpoints LIMIT 1').get();
  if (!epExists) {
    db.prepare('INSERT INTO api_endpoints (name, base_url, api_key, model, model_type) VALUES (?, ?, ?, ?, ?)').run(
      config.defaultEndpoint.name, config.defaultEndpoint.baseUrl, config.defaultEndpoint.apiKey, config.defaultEndpoint.model, config.defaultEndpoint.modelType
    );
  }
}

module.exports = db;
