import express from 'express';
import cors from 'cors';
import multer from 'multer';
import path from 'node:path';
import crypto from 'node:crypto';
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
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve static assets
app.use(express.static(PUBLIC_DIR));
app.use('/uploads', express.static(UPLOADS_DIR));

// Multer Storage Configuration
const multerStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const uniqueSuffix = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}`;
    cb(null, `photo-${uniqueSuffix}${ext}`);
  },
});

const fileFilter = (req, file, cb) => {
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
};

const upload = multer({
  storage: multerStorage,
  fileFilter,
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB max
  },
});

// Helper for admin route
app.get('/admin', (req, res) => {
  res.sendFile(path.resolve(PUBLIC_DIR, 'admin.html'));
});

// ==========================================
// API ROUTES
// ==========================================

// Create a new submission
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

// Get all submissions
app.get('/api/submissions', async (req, res) => {
  try {
    const list = await storage.getAll();
    return res.json(list);
  } catch (error) {
    console.error('Error fetching submissions:', error);
    return res.status(500).json({ error: 'Chyba při načítání odpovědí.' });
  }
});

// Get single submission
app.get('/api/submissions/:id', async (req, res) => {
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

// Delete a submission
app.delete('/api/submissions/:id', async (req, res) => {
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

// Get stats
app.get('/api/stats', async (req, res) => {
  try {
    const stats = await storage.getStats();
    return res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    return res.status(500).json({ error: 'Chyba při načítání statistik.' });
  }
});

// Export CSV
app.get('/api/export/csv', async (req, res) => {
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

// Export JSON
app.get('/api/export/json', async (req, res) => {
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

app.listen(PORT, () => {
  console.log(`\n==================================================`);
  console.log(`🚀 DOD Formulář běží na http://localhost:${PORT}`);
  console.log(`📋 Formulář pro studenty: http://localhost:${PORT}`);
  console.log(`🛡️  Administrace odpovědí: http://localhost:${PORT}/admin`);
  console.log(`==================================================\n`);
});
