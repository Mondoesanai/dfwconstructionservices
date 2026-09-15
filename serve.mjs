import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = 3170;

const MIME = {
  '.html': 'text/html; charset=utf-8', '.css': 'text/css', '.js': 'application/javascript',
  '.mjs': 'application/javascript', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.webp': 'image/webp',
  '.json': 'application/json',
};

function loadApiKey() {
  try {
    const raw = fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8');
    const cfg = JSON.parse(raw);
    return (cfg.rentcastApiKey || '').trim();
  } catch {
    return '';
  }
}

// Deterministic stand-in estimate so the demo behaves consistently for a
// given address before a real RentCast key is configured.
function mockEstimate(address) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  const value = 260000 + (hash % 390000); // $260k - $650k
  return {
    source: 'demo',
    value,
    low: Math.round(value * 0.95),
    high: Math.round(value * 1.05),
    bedrooms: 2 + (hash % 4), // 2-5
    bathrooms: 1 + (Math.floor(hash / 4) % 4), // 1-4
    squareFootage: 1200 + (hash % 2400), // 1200-3600
    yearBuilt: 1965 + (hash % 55),
    note: 'Sample estimate — add a RentCast API key in config.json for live data.',
  };
}

// Property Records gives us bed/bath/sqft for the personalization line.
// Best-effort only — if it fails, the value estimate still goes through.
async function fetchPropertyDetails(address, apiKey) {
  try {
    const url = `https://api.rentcast.io/v1/properties?address=${encodeURIComponent(address)}`;
    const res = await fetch(url, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
    if (!res.ok) return {};
    const data = await res.json();
    const record = Array.isArray(data) ? data[0] : data;
    if (!record) return {};
    return {
      bedrooms: record.bedrooms,
      bathrooms: record.bathrooms,
      squareFootage: record.squareFootage ?? record.livingArea,
      yearBuilt: record.yearBuilt,
    };
  } catch {
    return {};
  }
}

async function liveEstimate(address, apiKey) {
  const url = `https://api.rentcast.io/v1/avm/value?address=${encodeURIComponent(address)}`;
  const res = await fetch(url, { headers: { 'X-Api-Key': apiKey, Accept: 'application/json' } });
  if (!res.ok) throw new Error(`RentCast responded ${res.status}`);
  const data = await res.json();
  const value = data.price ?? data.value ?? data.estimatedValue;
  if (!value) throw new Error('RentCast response missing a value');

  const details = await fetchPropertyDetails(address, apiKey);

  return {
    source: 'live',
    value,
    low: data.priceRangeLow ?? data.priceLow ?? Math.round(value * 0.95),
    high: data.priceRangeHigh ?? data.priceHigh ?? Math.round(value * 1.05),
    bedrooms: details.bedrooms,
    bathrooms: details.bathrooms,
    squareFootage: details.squareFootage,
    yearBuilt: details.yearBuilt,
  };
}

async function handleEstimate(req, res, query) {
  const address = (query.get('address') || '').trim();
  res.setHeader('Content-Type', 'application/json');
  if (!address) {
    res.writeHead(400);
    res.end(JSON.stringify({ error: 'Missing address' }));
    return;
  }

  const apiKey = loadApiKey();
  if (!apiKey) {
    res.writeHead(200);
    res.end(JSON.stringify(mockEstimate(address)));
    return;
  }

  try {
    const result = await liveEstimate(address, apiKey);
    res.writeHead(200);
    res.end(JSON.stringify(result));
  } catch (err) {
    console.error('RentCast lookup failed, falling back to sample data:', err.message);
    res.writeHead(200);
    res.end(JSON.stringify(mockEstimate(address)));
  }
}

const server = http.createServer((req, res) => {
  const requestUrl = new URL(req.url, `http://localhost:${PORT}`);

  if (requestUrl.pathname === '/api/estimate') {
    handleEstimate(req, res, requestUrl.searchParams);
    return;
  }

  let urlPath = decodeURIComponent(requestUrl.pathname);
  if (urlPath === '/') urlPath = '/index.html';
  let filePath = path.join(__dirname, urlPath);
  if (!path.extname(filePath)) filePath += '.html';

  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(filePath).toLowerCase()] || 'application/octet-stream' });
    res.end(data);
  });
});

server.listen(PORT, () => {
  const apiKey = loadApiKey();
  console.log(`\n  DFW Facelift Tool running at http://localhost:${PORT}`);
  console.log(apiKey ? '  RentCast: LIVE key detected.' : '  RentCast: no key in config.json — serving sample estimates.');
  console.log('  Press Ctrl+C to stop.\n');
});
