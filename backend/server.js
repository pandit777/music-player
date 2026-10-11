
const express = require('express');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const { parseFile } = require('music-metadata');

const app = express();
const PORT = process.env.PORT || 5000;

const SONG_BASE_URL =
  'https://music-player-wji3.onrender.com/songs/';

app.use(cors());
app.use(express.json());

const uploadDir = path.join(__dirname, 'uploads');
const songsFile = path.join(__dirname, 'songs.json');
const playlistsFile = path.join(__dirname, 'playlists.json');

for (const dir of [uploadDir]) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

for (const file of [songsFile, playlistsFile]) {
  if (!fs.existsSync(file)) {
    fs.writeFileSync(file, '[]');
  }
}

app.use('/songs', express.static(uploadDir));

function readJSON(file) {
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

function makeTitle(filename) {
  return path.parse(filename).name
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, c => c.toUpperCase());
}

function getNextId(songs) {
  const maxId = songs.reduce((max, song) => {
    const id = Number(song.id);
    return Number.isSafeInteger(id) && id > max ? id : max;
  }, 0);

  return String(maxId + 1);
}

function formatDuration(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) {
    return '00:00';
  }

  const total = Math.floor(seconds);
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const secs = total % 60;
  const pad = n => String(n).padStart(2, '0');

  return hours
    ? `${pad(hours)}:${pad(minutes)}:${pad(secs)}`
    : `${pad(minutes)}:${pad(secs)}`;
}

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadDir),

  filename: (req, file, cb) => {
    const filename = path.basename(file.originalname);

    if (path.extname(filename).toLowerCase() !== '.mp3') {
      return cb(new Error('Only MP3 files are allowed'));
    }

    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 100 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (path.extname(file.originalname).toLowerCase() !== '.mp3') {
      return cb(new Error('Only MP3 files are allowed'));
    }
    cb(null, true);
  }
});

// Upload MP3 and automatically save song metadata
app.post('/upload-song', upload.single('audio'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Please select an MP3 file' });
  }

  try {
    const songs = readJSON(songsFile);
    const filename = req.file.filename;

    // Prevent accidental duplicate song records
    if (songs.some(s => s.filename === filename)) {
      return res.status(409).json({
        error: 'This filename already exists. Choose a different filename.'
      });
    }

    const title = String(req.body.title || '').trim()
      || makeTitle(filename);

    const artist = String(req.body.artist || '').trim()
      || 'Unknown Artist';

    const cover = String(req.body.cover || '').trim();

    if (cover && !/^https?:\/\/\S+$/i.test(cover)) {
      return res.status(400).json({
        error: 'Cover must be a valid HTTP or HTTPS URL'
      });
    }

    let duration = '00:00';

    try {
      const metadata = await parseFile(req.file.path);
      duration = formatDuration(metadata.format.duration);
    } catch (err) {
      console.warn('Duration detection failed:', err.message);
    }

    const song = {
      id: getNextId(songs),
      title,
      artist,
      cover,
      link: SONG_BASE_URL + encodeURIComponent(filename),
      type: 'local',
      duration
    };

    // filename is kept for duplicate checking
    songs.push({ ...song, filename });
    writeJSON(songsFile, songs);

    res.status(201).json({
      success: true,
      message: 'Song uploaded successfully',
      ...song
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      error: 'Could not save song metadata'
    });
  }
});

// Get all songs
app.get('/songs-meta', (req, res) => {
  res.json(readJSON(songsFile));
});

// Get song by ID
app.get('/songs-meta/:id', (req, res) => {
  const songs = readJSON(songsFile);
  const song = songs.find(s => s.id === req.params.id);

  if (!song) {
    return res.status(404).json({ error: 'Song not found' });
  }

  res.json(song);
});

// Get playlists with their song details
app.get('/playlists', (req, res) => {
  const playlists = readJSON(playlistsFile);
  const songs = readJSON(songsFile);

  res.json(playlists.map(p => ({
    ...p,
    songDetails: (p.songs || [])
      .map(id => songs.find(s => s.id === id))
      .filter(Boolean)
  })));
});

// Handle upload errors
app.use((err, req, res, next) => {
  if (res.headersSent) return next(err);

  res.status(400).json({
    error: err.message || 'Request failed'
  });
});

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  console.log('Songs metadata:', songsFile);
  console.log('MP3 uploads:', uploadDir);
});
