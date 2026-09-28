const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = 5000;

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
const songsFile = path.join(__dirname, 'songs.json');
const playlistsFile = path.join(__dirname, 'playlists.json');

// Auto-create
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });
if (!fs.existsSync(songsFile)) fs.writeFileSync(songsFile, '[]');
if (!fs.existsSync(playlistsFile)) fs.writeFileSync(playlistsFile, '[]');

// Serve audio files
app.use('/songs', express.static(uploadDir));

// Helpers
const readJSON = (file) => JSON.parse(fs.readFileSync(file, 'utf8'));
const writeJSON = (file, data) => fs.writeFileSync(file, JSON.stringify(data, null, 2));

// ============ ROUTES ============

// Saare songs (JSON se)
app.get('/songs-meta', (req, res) => {
  res.json(readJSON(songsFile));
});

// Ek song ki detail
app.get('/songs-meta/:id', (req, res) => {
  const songs = readJSON(songsFile);
  const song = songs.find(s => s.id === req.params.id);
  if (!song) return res.status(404).json({ error: 'Song not found' });
  res.json(song);
});

// Playlists
app.get('/playlists', (req, res) => {
  const playlists = readJSON(playlistsFile);
  const songs = readJSON(songsFile);

  // Har playlist me songs ki full detail attach karo
  const enriched = playlists.map(p => ({
    ...p,
    songDetails: p.songs
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean)
  }));

  res.json(enriched);
});

// ============ START ============
app.listen(PORT, () => {
  console.log('✅ Server: http://localhost:' + PORT);
  console.log('📝 Songs: songs.json');
  console.log('📂 Audio files: uploads/');
});