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
let DATA_DIR = isServerless
  ? path.resolve(os.tmpdir(), 'formular-dod-data')
  : path.resolve(__dirname, '../data');

// Safety check: ensure DATA_DIR is actually writable; fallback to os.tmpdir()
try {
  if (!fsSync.existsSync(DATA_DIR)) {
    fsSync.mkdirSync(DATA_DIR, { recursive: true });
  }
  const testFile = path.resolve(DATA_DIR, `.write-test-${Date.now()}`);
  fsSync.writeFileSync(testFile, '1');
  fsSync.unlinkSync(testFile);
} catch {
  DATA_DIR = path.resolve(os.tmpdir(), 'formular-dod-data');
  if (!fsSync.existsSync(DATA_DIR)) {
    try {
      fsSync.mkdirSync(DATA_DIR, { recursive: true });
    } catch (e) {
      console.warn('Could not create DATA_DIR in os.tmpdir():', e.message);
    }
  }
}

const UPLOADS_DIR = path.resolve(DATA_DIR, 'uploads');
const DB_FILE = path.resolve(DATA_DIR, 'submissions.json');

if (!fsSync.existsSync(UPLOADS_DIR)) {
  try {
    fsSync.mkdirSync(UPLOADS_DIR, { recursive: true });
  } catch (err) {
    console.warn('Could not create UPLOADS_DIR:', err.message);
  }
}

// Seed with bundled submissions.json if present and DB_FILE doesn't exist
const bundledDB = path.resolve(__dirname, '../data/submissions.json');
if (!fsSync.existsSync(DB_FILE)) {
  if (fsSync.existsSync(bundledDB)) {
    try {
      fsSync.copyFileSync(bundledDB, DB_FILE);
    } catch {
      try {
        fsSync.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
      } catch {}
    }
  } else {
    try {
      fsSync.writeFileSync(DB_FILE, JSON.stringify([], null, 2), 'utf8');
    } catch {}
  }
}

class Storage {
  async #readAll() {
    try {
      const content = await fs.readFile(DB_FILE, 'utf8');
      if (!content.trim()) return [];
      return JSON.parse(content);
    } catch (err) {
      if (err.code === 'ENOENT') {
        return [];
      }
      console.error('Error reading submissions.json:', err);
      return [];
    }
  }

  async #writeAll(data) {
    try {
      const tempFile = `${DB_FILE}.${crypto.randomUUID()}.tmp`;
      const jsonString = JSON.stringify(data, null, 2);
      await fs.writeFile(tempFile, jsonString, 'utf8');
      await fs.rename(tempFile, DB_FILE);
    } catch (err) {
      console.error('Error writing submissions.json:', err);
      // Direct write fallback
      try {
        await fs.writeFile(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
      } catch (e) {
        console.error('Direct write failed:', e);
      }
    }
  }

  async getAll() {
    const list = await this.#readAll();
    return list.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  }

  async getById(id) {
    const list = await this.#readAll();
    return list.find((item) => item.id === id) || null;
  }

  async create(payload, file) {
    const list = await this.#readAll();
    const id = crypto.randomUUID();

    let base64 = null;
    if (file && file.path) {
      try {
        const fileBuffer = await fs.readFile(file.path);
        base64 = `data:${file.mimetype};base64,${fileBuffer.toString('base64')}`;
      } catch (e) {
        console.warn('Could not read photo buffer for base64:', e.message);
      }
    }

    const photoInfo = file
      ? {
          filename: file.filename,
          originalName: file.originalname,
          mimetype: file.mimetype,
          size: file.size,
          url: `/uploads/${file.filename}`,
          base64: base64,
        }
      : null;

    const submission = {
      id,
      createdAt: new Date().toISOString(),
      // 1. O studentovi
      fullName: (payload.fullName || '').trim(),
      schoolClass: (payload.schoolClass || '').trim(),
      email: (payload.email || '').trim(),
      // 2. O škole
      whySchool: (payload.whySchool || '').trim(),
      whatYouLike: (payload.whatYouLike || '').trim(),
      favoriteSubject: (payload.favoriteSubject || '').trim(),
      adviceForFreshmen: (payload.adviceForFreshmen || '').trim(),
      // 3. Projekty & Úspěchy
      projects: (payload.projects || '').trim(),
      competitions: (payload.competitions || '').trim(),
      // 4. Sociální sítě & Odkazy
      instagram: (payload.instagram || '').trim(),
      github: (payload.github || '').trim(),
      linkedin: (payload.linkedin || '').trim(),
      portfolio: (payload.portfolio || '').trim(),
      // 5. Něco navíc
      additionalNote: (payload.additionalNote || '').trim(),
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

    // Delete photo file if present on disk
    if (deleted.photo?.filename) {
      const filePath = path.resolve(UPLOADS_DIR, deleted.photo.filename);
      try {
        await fs.unlink(filePath);
      } catch (err) {
        console.warn('Failed to delete photo file:', filePath, err.message);
      }
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
