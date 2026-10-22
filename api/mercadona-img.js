// Reenvía una miniatura de producto de Mercadona para poder meterla en el PDF
// cuando el navegador no puede leerla directamente (CORS).
// Solo fotos de producto del CDN de Mercadona (/images/…), con los parámetros de tamaño que usa la app
// (cualquier otro saltaría la caché del CDN), sin seguir redirecciones, solo formatos de foto y hasta 2 MB.

const ALLOWED_HOST = 'prod-mercadona.imgix.net';
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif'];
const MAX_BYTES = 2_000_000;
const TIMEOUT_MS = 8000;

function isAllowedUrl(url) {
    if (url.protocol !== 'https:' || url.hostname !== ALLOWED_HOST || url.port !== '') return false;
    if (!/^\/images\/[\w-]+\.(jpg|jpeg|png|webp)$/i.test(url.pathname)) return false;
    for (const [key, value] of url.searchParams) {
        if (key === 'fit' && (value === 'crop' || value === 'max')) continue;
        if ((key === 'w' || key === 'h') && /^[1-9]\d{1,2}$/.test(value) && Number(value) <= 900) continue;
        return false;
    }
    return true;
}

export default async function handler(req, res) {
    if (req.method !== 'GET') {
        res.setHeader('Allow', 'GET');
        return res.status(405).end();
    }
    if (Object.keys(req.query).some(key => key !== 'url') || typeof req.query.url !== 'string') {
        return res.status(400).end();
    }

    let url;
    try {
        url = new URL(req.query.url);
    } catch {
        return res.status(400).end();
    }
    if (!isAllowedUrl(url)) return res.status(400).end();

    try {
        const upstream = await fetch(url, { redirect: 'error', signal: AbortSignal.timeout(TIMEOUT_MS) });
        if (!upstream.ok) return res.status(upstream.status === 404 ? 404 : 502).end();

        const type = (upstream.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
        if (!ALLOWED_TYPES.includes(type)) return res.status(415).end();
        const declared = Number(upstream.headers.get('content-length') || 0);
        if (declared > MAX_BYTES) return res.status(413).end();

        const buffer = Buffer.from(await upstream.arrayBuffer());
        if (buffer.length > MAX_BYTES) return res.status(413).end();

        res.setHeader('Content-Type', type);
        res.setHeader('X-Content-Type-Options', 'nosniff');
        res.setHeader('Cache-Control', 'public, s-maxage=604800, stale-while-revalidate=604800');
        return res.status(200).send(buffer);
    } catch {
        return res.status(502).end();
    }
}
