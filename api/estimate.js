// Vercel serverless function — this is what actually runs in production.
// serve.mjs (the plain Node http server) is for local dev only; Vercel's
// "Other" static preset never executes it, it only picks up files under /api.

function mockEstimate(address) {
  let hash = 0;
  for (let i = 0; i < address.length; i++) {
    hash = (hash * 31 + address.charCodeAt(i)) >>> 0;
  }
  const value = 260000 + (hash % 390000);
  return {
    source: 'demo',
    value,
    low: Math.round(value * 0.95),
    high: Math.round(value * 1.05),
    bedrooms: 2 + (hash % 4),
    bathrooms: 1 + (Math.floor(hash / 4) % 4),
    squareFootage: 1200 + (hash % 2400),
    yearBuilt: 1965 + (hash % 55),
    note: 'Sample estimate — RENTCAST_API_KEY is not set in Vercel yet.',
  };
}

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

module.exports = async (req, res) => {
  const address = (req.query.address || '').toString().trim();
  if (!address) {
    res.status(400).json({ error: 'Missing address' });
    return;
  }

  const apiKey = (process.env.RENTCAST_API_KEY || '').trim();
  if (!apiKey) {
    res.status(200).json(mockEstimate(address));
    return;
  }

  try {
    const result = await liveEstimate(address, apiKey);
    res.status(200).json(result);
  } catch (err) {
    console.error('RentCast lookup failed, falling back to sample data:', err.message);
    res.status(200).json(mockEstimate(address));
  }
};
