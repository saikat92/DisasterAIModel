// server.js
import express from 'express';
import fetch from 'node-fetch';
import cors from 'cors';

const app = express();
app.use(cors()); // allow requests from frontend

app.get('/elevation', async (req, res) => {
  const { lat, lon } = req.query;
  const url = `https://api.opentopodata.org/v1/aster30m?locations=${lat},${lon}`;

  try {
    const response = await fetch(url);
    const data = await response.json();
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch elevation data.' });
  }
});

app.listen(3000, () => console.log('Proxy server running on port 3000'));
