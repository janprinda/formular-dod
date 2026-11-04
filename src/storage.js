import fs from 'node:fs/promises';
import fsSync from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Detect serverless environment (Vercel, AWS Lambda)
const isServerless = Boolean(
  process.env.VERCEL ||
  process.env.AWS_LAMBDA_FUNCTION_NAME ||
  process.env.LAMBDA_TASK_ROOT
);

// Determine writable data directory
function resolveDataDir() {
  if (isServerless) {
    return path.resolve(os.tmpdir(), 'formular-dod-data');
  }

  const localDir = path.resolve(__dirname, '../data');
  try {
    if (!fsSync.existsSync(localDir)) {
      fsSync.mkdirSync(localDir, { recursive: true });
    }
    const testFile = path.resolve(localDir, `.write-test-${Date.now()}`);
    fsSync.writeFileSync(testFile, '1');
    fsSync.unlinkSync(testFile);
    return localDir;
  } catch {
    return path.resolve(os.tmpdir(), 'formular-dod-data');
  }
}

const DATA_DIR = resolveDataDir();
const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'submissions.json');

// Bundled DB template from repo
const BUNDLED_DB = path.resolve(__dirname, '../data/submissions.json');

// Process-level in-memory cache to guarantee persistence within the container
let memorySubmissions = null;

// ==========================================
// CLOUD BACKEND 1: VERCEL KV / UPSTASH REDIS
// (Automatically active when KV is connected in Vercel Storage)
// ==========================================
const KV_URL = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
const KV_TOKEN = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;

async function readFromKV() {
  if (!KV_URL || !KV_TOKEN) return null;
  try {
    const res = await fetch(`${KV_URL}/get/dod_submissions`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
    });
    if (!res.ok) return null;
    const body = await res.json();
    if (body && body.result) {
      const parsed = typeof body.result === 'string' ? JSON.parse(body.result) : body.result;
      return Array.isArray(parsed) ? parsed : null;
    }
  } catch (err) {
    console.warn('KV read error:', err.message);
  }
  return null;
}

async function writeToKV(list) {
  if (!KV_URL || !KV_TOKEN) return false;
  try {
    const res = await fetch(KV_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${KV_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(['SET', 'dod_submissions', JSON.stringify(list)]),
    });
    return res.ok;
  } catch (err) {
    console.warn('KV write error:', err.message);
    return false;
  }
}

// ==========================================
// CLOUD BACKEND 2: GITHUB API SYNC
// (Active if GITHUB_TOKEN environment variable is set)
// ==========================================
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_REPO = process.env.GITHUB_REPO || 'janprinda/formular-dod';
const GITHUB_FILE_PATH = 'data/submissions.json';

async function readFromGitHub() {
  if (!GITHUB_TOKEN) return null;
  try {
    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'User-Agent': 'formular-dod',
      },
    });
    if (!res.ok) return null;
    const data = await res.json();
    const content = Buffer.from(data.content, 'base64').toString('utf8');
    const parsed = JSON.parse(content);
    return { list: Array.isArray(parsed) ? parsed : [], sha: data.sha };
  } catch (err) {
    console.warn('GitHub read error:', err.message);
    return null;
  }
}

async function writeToGitHub(list) {
  if (!GITHUB_TOKEN) return false;
  try {
    const current = await readFromGitHub();
    const sha = current?.sha;

    const content = Buffer.from(JSON.stringify(list, null, 2)).toString('base64');
    const body = {
      message: 'chore(data): sync DOD student submissions',
      content,
      branch: 'main',
    };
    if (sha) body.sha = sha;

    const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}/contents/${GITHUB_FILE_PATH}`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${GITHUB_TOKEN}`,
        Accept: 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'formular-dod',
      },
      body: JSON.stringify(body),
    });
    return res.ok;
  } catch (err) {
    console.warn('GitHub write error:', err.message);
    return false;
  }
}

class Storage {
  async #ensureReady() {
    try {
      if (!fsSync.existsSync(DATA_DIR)) {
        fsSync.mkdirSync(DATA_DIR, { recursive: true });
      }
      if (!fsSync.existsSync(UPLOADS_DIR)) {
        fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
      }
    } catch (e) {
      console.warn('Could not ensure directories exist:', e.message);
    }
  }

  async #readAll() {
    await this.#ensureReady();

    // 1. Check Vercel KV / Upstash Redis (Shared globally across all containers)
    const kvData = await readFromKV();
    if (Array.isArray(kvData) && kvData.length > 0) {
      memorySubmissions = kvData;
      return memorySubmissions;
    }

    // 2. Check GitHub API sync
    const ghData = await readFromGitHub();
    if (ghData && Array.isArray(ghData.list) && ghData.list.length > 0) {
      memorySubmissions = ghData.list;
      return memorySubmissions;
    }

    // 3. Check process-level in-memory cache
    if (Array.isArray(memorySubmissions) && memorySubmissions.length > 0) {
      return memorySubmissions;
    }

    // 4. Try reading DB_FILE (e.g. /tmp or local data/)
    try {
      if (fsSync.existsSync(DB_FILE)) {
        const content = await fs.readFile(DB_FILE, 'utf8');
        if (content && content.trim()) {
          memorySubmissions = JSON.parse(content);
          if (Array.isArray(memorySubmissions) && memorySubmissions.length > 0) {
            // Seed KV if available
            writeToKV(memorySubmissions).catch(() => {});
            return memorySubmissions;
          }
        }
      }
    } catch (err) {
      console.warn('Could not read DB_FILE:', err.message);
    }

    // 5. Try reading BUNDLED_DB
    try {
      if (fsSync.existsSync(BUNDLED_DB)) {
        const content = await fs.readFile(BUNDLED_DB, 'utf8');
        if (content && content.trim()) {
          memorySubmissions = JSON.parse(content);
          try {
            await fs.writeFile(DB_FILE, content, 'utf8');
          } catch {}
          writeToKV(memorySubmissions).catch(() => {});
          return memorySubmissions;
        }
      }
    } catch (err) {
      console.warn('Could not read BUNDLED_DB:', err.message);
    }

    memorySubmissions = [];
    return memorySubmissions;
  }

  async #writeAll(data) {
    await this.#ensureReady();
    memorySubmissions = data;

    // 1. Sync to Vercel KV / Upstash Redis (if configured)
    await writeToKV(data);

    // 2. Sync to GitHub in background (if token configured)
    writeToGitHub(data).catch(() => {});

    // 3. Write to local disk file
    const jsonString = JSON.stringify(data, null, 2);
    try {
      const tempFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
      await fs.writeFile(tempFile, jsonString, 'utf8');
      await fs.rename(tempFile, DB_FILE);
    } catch (err) {
      console.warn('Atomic write failed, attempting direct write:', err.message);
      try {
        await fs.writeFile(DB_FILE, jsonString, 'utf8');
      } catch (err2) {
        try {
          fsSync.writeFileSync(DB_FILE, jsonString, 'utf8');
        } catch (err3) {
          console.error('Disk write failed (stored in memory/KV):', err3.message);
        }
      }
    }
  }

  async getAll() {
    const list = await this.#readAll();
    return [...list].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getById(id) {
    const list = await this.#readAll();
    return list.find((item) => item.id === id) || null;
  }

  async create(payload, file) {
    const list = await this.#readAll();
    const id = crypto.randomUUID();

    let photoInfo = null;

    if (file) {
      const ext = path.extname(file.originalname || '').toLowerCase() || '.jpg';
      const filename = `photo-${Date.now()}-${crypto.randomBytes(6).toString('hex')}${ext}`;
      
      let base64 = null;
      if (file.buffer) {
        base64 = `data:${file.mimetype || 'image/jpeg'};base64,${file.buffer.toString('base64')}`;
      } else if (file.path) {
        try {
          const buf = await fs.readFile(file.path);
          base64 = `data:${file.mimetype || 'image/jpeg'};base64,${buf.toString('base64')}`;
        } catch {}
      }

      // Try writing to disk if buffer exists, but never fail if disk is read-only
      if (file.buffer) {
        try {
          await this.#ensureReady();
          await fs.writeFile(path.resolve(UPLOADS_DIR, filename), file.buffer);
        } catch (e) {
          console.warn('Could not write photo file to disk, relying on base64 fallback:', e.message);
        }
      }

      photoInfo = {
        filename,
        originalName: file.originalname || filename,
        mimetype: file.mimetype || 'image/jpeg',
        size: file.size || (file.buffer ? file.buffer.length : 0),
        url: `/uploads/${filename}`,
        base64,
      };
    }

    const submission = {
      id,
      createdAt: new Date().toISOString(),
      // 1. O studentovi
      fullName: String(payload.fullName || '').trim(),
      schoolClass: String(payload.schoolClass || '').trim(),
      email: String(payload.email || '').trim(),
      // 2. O škole
      whySchool: String(payload.whySchool || '').trim(),
      whatYouLike: String(payload.whatYouLike || '').trim(),
      favoriteSubject: String(payload.favoriteSubject || '').trim(),
      adviceForFreshmen: String(payload.adviceForFreshmen || '').trim(),
      // 3. Projekty & Úspěchy
      projects: String(payload.projects || '').trim(),
      competitions: String(payload.competitions || '').trim(),
      // 4. Sociální sítě & Odkazy
      instagram: String(payload.instagram || '').trim(),
      github: String(payload.github || '').trim(),
      linkedin: String(payload.linkedin || '').trim(),
      portfolio: String(payload.portfolio || '').trim(),
      // 5. Něco navíc
      additionalNote: String(payload.additionalNote || '').trim(),
      // 6. Fotka
      photo: photoInfo,
      // 7. Souhlas
      consent: payload.consent === true || payload.consent === 'true' || payload.consent === 'on',
    };

    list.unshift(submission);
    await this.#writeAll(list);
    return submission;
  }

  async delete(id) {
    const list = await this.#readAll();
    const index = list.findIndex((item) => item.id === id);
    if (index === -1) return false;

    const [deleted] = list.splice(index, 1);
    await this.#writeAll(list);

    // Try deleting photo file from disk if present
    if (deleted.photo?.filename) {
      const filePath = path.resolve(UPLOADS_DIR, deleted.photo.filename);
      try {
        await fs.unlink(filePath);
      } catch {}
    }

    return true;
  }

  async getStats() {
    const list = await this.#readAll();
    const total = list.length;
    const withPhotos = list.filter((item) => item.photo).length;

    // Count by class
    const classCounts = {};
    for (const item of list) {
      const cls = item.schoolClass || 'Neuvedeno';
      classCounts[cls] = (classCounts[cls] || 0) + 1;
    }

    return {
      total,
      withPhotos,
      classCounts,
      latestAt: list.length > 0 ? list[0].createdAt : null,
    };
  }

  async exportCSV() {
    const list = await this.getAll();
    const headers = [
      'ID',
      'Datum vytvoření',
      'Jméno a příjmení',
      'Třída',
      'E-mail',
      'Proč tato škola',
      'Co se líbí na škole',
      'Oblíbený předmět',
      'Vzkaz pro prváky',
      'Projekty',
      'Soutěže a ocenění',
      'Instagram',
      'GitHub',
      'LinkedIn',
      'Portfolio',
      'Něco navíc',
      'Má fotku',
      'URL fotky',
      'Souhlas udělen',
    ];

    const escapeCSV = (val) => {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    };

    const rows = list.map((item) => [
      escapeCSV(item.id),
      escapeCSV(new Date(item.createdAt).toLocaleString('cs-CZ')),
      escapeCSV(item.fullName),
      escapeCSV(item.schoolClass),
      escapeCSV(item.email),
      escapeCSV(item.whySchool),
      escapeCSV(item.whatYouLike),
      escapeCSV(item.favoriteSubject),
      escapeCSV(item.adviceForFreshmen),
      escapeCSV(item.projects),
      escapeCSV(item.competitions),
      escapeCSV(item.instagram),
      escapeCSV(item.github),
      escapeCSV(item.linkedin),
      escapeCSV(item.portfolio),
      escapeCSV(item.additionalNote),
      escapeCSV(item.photo ? 'Ano' : 'Ne'),
      escapeCSV(item.photo ? item.photo.url : ''),
      escapeCSV(item.consent ? 'Ano' : 'Ne'),
    ]);

    // UTF-8 BOM (\uFEFF) ensures Excel displays Czech characters accurately
    const csvContent =
      '\uFEFF' +
      [headers.map(escapeCSV).join(';'), ...rows.map((r) => r.join(';'))].join('\r\n');

    return csvContent;
  }
}

export const storage = new Storage();
export { DATA_DIR, UPLOADS_DIR, DB_FILE };
