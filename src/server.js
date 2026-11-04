import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
import fsSync from 'node:fs';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { storage, UPLOADS_DIR } from './storage.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PUBLIC_DIR = path.resolve(__dirname, '../public');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json({ limit: '20mb' }));
app.use(express.urlencoded({ extended: true, limit: '20mb' }));

// Serve static assets from public/
app.use(express.static(PUBLIC_DIR));

// Serve photos from UPLOADS_DIR with fallback to base64 for serverless resilience
app.get('/uploads/:filename', async (req, res) => {
  const filename = path.basename(req.params.filename);
  const filePath = path.resolve(UPLOADS_DIR, filename);

  if (fsSync.existsSync(filePath)) {
    return res.sendFile(filePath);
  }

  // If not on disk (e.g. serverless cold container), check if base64 exists in submissions
  try {
    const list = await storage.getAll();
    const item = list.find((s) => s.photo && s.photo.filename === filename);
    if (item && item.photo && item.photo.base64) {
      const matches = item.photo.base64.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      if (matches && matches.length === 3) {
        const buffer = Buffer.from(matches[2], 'base64');
        res.setHeader('Content-Type', matches[1]);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        return res.send(buffer);
      }
    }
  } catch (err) {
    console.error('Error serving fallback photo:', err);
  }

  return res.status(404).send('Fotografie nebyla nalezena.');
});

// Multer Memory Storage Configuration (100% resilient across Serverless, Docker & Local)
const upload = multer({
  storage: multer.memoryStorage(),
  fileFilter: (req, file, cb) => {
    const allowedMimeTypes = [
      'image/jpeg',
      'image/png',
      'image/webp',
      'image/heic',
      'image/avif',
    ];
    if (allowedMimeTypes.includes(file.mimetype) || file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Povoleny jsou pouze obrázky (JPG, PNG, WEBP, HEIC, AVIF).'), false);
    }
  },
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
});

// Helper for admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'admin.html'));
});

// Helper for root route
app.get('/', (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'index.html'));
});

// Admin Password & Authentication
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin1234';

const authMiddleware = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const bearerToken = authHeader ? authHeader.replace(/^Bearer\s+/i, '').trim() : null;
  const queryToken = req.query.auth ? String(req.query.auth).trim() : null;
  const cookieToken = req.headers.cookie
    ? req.headers.cookie.split(';').map(c => c.trim()).find(c => c.startsWith('admin_auth='))?.split('=')[1]
    : null;

  const provided = bearerToken || queryToken || cookieToken;

  if (provided && provided === ADMIN_PASSWORD) {
    return next();
  }

  return res.status(401).json({ error: 'Neautorizovaný přístup. Zadejte správné heslo administrátora.' });
};

// Admin login verification endpoint
app.post('/api/admin/login', (req, res) => {
  const { password } = req.body || {};
  if (password && String(password).trim() === ADMIN_PASSWORD) {
    return res.json({
      success: true,
      token: ADMIN_PASSWORD,
      message: 'Přihlášení úspěšné.',
    });
  }
  return res.status(401).json({ error: 'Nesprávné heslo administrátora.' });
});

// ==========================================
// API ROUTES
// ==========================================

// Create a new submission (Public for students)
app.post('/api/submissions', upload.single('photo'), async (req, res) => {
  try {
    const { fullName, schoolClass } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ error: 'Jméno a příjmení je povinné pole.' });
    }
    if (!schoolClass || !schoolClass.trim()) {
      return res.status(400).json({ error: 'Třída je povinné pole.' });
    }

    const submission = await storage.create(req.body, req.file);
    return res.status(201).json({
      success: true,
      message: 'Odpovědi byly úspěšně odeslány. Děkujeme!',
      submission,
    });
  } catch (error) {
    console.error('Error saving submission:', error);
    return res.status(500).json({
      error: 'Nastala chyba při ukládání odpovědí. Zkuste to prosím znovu.',
      details: error.message,
    });
  }
});

// Get all submissions (Protected)
app.get('/api/submissions', authMiddleware, async (req, res) => {
  try {
    const list = await storage.getAll();
    return res.json(list);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return res.status(500).json({ error: 'Chyba při načítání odpovědí.' });
  }
});

// Get single submission (Protected)
app.get('/api/submissions/:id', authMiddleware, async (req, res) => {
  try {
    const item = await storage.getById(req.params.id);
    if (!item) {
      return res.status(404).json({ error: 'Odpověď nebyla nalezena.' });
    }
    return res.json(item);
  } catch (error) {
    console.error('Error fetching submission:', error);
    return res.status(500).json({ error: 'Chyba při načítání detailu.' });
  }
});

// Delete a submission (Protected)
app.delete('/api/submissions/:id', authMiddleware, async (req, res) => {
  try {
    const deleted = await storage.delete(req.params.id);
    if (!deleted) {
      return res.status(404).json({ error: 'Odpověď nebyla nalezena.' });
    }
    return res.json({ success: true, message: 'Záznam byl úspěšně smazán.' });
  } catch (error) {
    console.error('Error deleting submission:', error);
    return res.status(500).json({ error: 'Chyba při mazání záznamu.' });
  }
});

// Get stats (Protected)
app.get('/api/stats', authMiddleware, async (req, res) => {
  try {
    const stats = await storage.getStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({ error: 'Chyba při načítání statistik.' });
  }
});

// Export CSV (Protected)
app.get('/api/export/csv', authMiddleware, async (req, res) => {
  try {
    const csvData = await storage.exportCSV();
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dod_odpovedi_${dateStr}.csv"`);
    return res.send(csvData);
  } catch (error) {
    console.error('Error exporting CSV:', error);
    return res.status(500).json({ error: 'Chyba při exportu do CSV.' });
  }
});

// Export JSON (Protected)
app.get('/api/export/json', authMiddleware, async (req, res) => {
  try {
    const list = await storage.getAll();
    const dateStr = new Date().toISOString().split('T')[0];
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="dod_odpovedi_${dateStr}.json"`);
    return res.send(JSON.stringify(list, null, 2));
  } catch (error) {
    console.error('Error exporting JSON:', error);
    return res.status(500).json({ error: 'Chyba při exportu do JSON.' });
  }
});

// Multer error handling middleware
app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({ error: 'Fotka je příliš velká. Maximální velikost je 15 MB.' });
    }
    return res.status(400).json({ error: `Chyba nahrávání: ${err.message}` });
  }
  if (err) {
    return res.status(400).json({ error: err.message || 'Nastala neočekávaná chyba.' });
  }
  next();
});

// Only start listening when not running inside a serverless environment (e.g. Vercel)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`\n==================================================`);
    console.log(`🚀 DOD Formulář běží na http://localhost:${PORT}`);
    console.log(`📋 Formulář pro studenty: http://localhost:${PORT}`);
    console.log(`🛡️  Administrace odpovědí: http://localhost:${PORT}/admin`);
    console.log(`==================================================\n`);
  });
}

export default app;
