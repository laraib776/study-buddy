import dotenv from 'dotenv';
import app from './app.js';

dotenv.config();

const PORT = Number(process.env.PORT || 8787);

const server = app.listen(PORT, () => {
  console.log(`StudyBuddy backend listening on http://localhost:${PORT}`);
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.log(`StudyBuddy backend is already running on http://localhost:${PORT}`);
    process.exit(0);
  }
  throw error;
});
