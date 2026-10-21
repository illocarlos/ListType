// Reenvía una miniatura de producto de Mercadona para poder meterla en el PDF
// cuando el navegador no puede leerla directamente (CORS).
// Solo acepta imágenes https del CDN de Mercadona y hasta 2 MB.

const ALLOWED_HOST = 'prod-mercadona.imgix.net';
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8000;

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }

    let url;
    try {
        url = new URL(String(req.query.url ?? ''));
    } catch {
        return res.status(400).end();
    }
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST) {
        return res.status(400).end();
    }

    try {
        const upstream = await fetch(url, { signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!upstream.ok) return res.status(upstream.status).end();

        const type = upstream.headers.get('content-type') || '';
        if (!type.startsWith('image/')) return res.status(415).end();

        const buffer = Buffer.from(await upstream.arrayBuffer());
        if (buffer.length > MAX_BYTES) return res.status(413).end();

        res.setHeader('Content-Type', type);
        res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=604800');
        return res.status(200).send(buffer);
    } catch {
        return res.status(502).end();
    }
}
