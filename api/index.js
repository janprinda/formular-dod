import app from '../src/server.js';

// Disable Vercel's automatic body parser so Multer and Express can handle raw multipart/form-data
export const config = {
  api: {
    bodyParser: false,
    responseLimit: '20mb',
  },
};

export default app;
