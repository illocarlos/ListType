// Credenciales de Upstash compartidas por las funciones (el guion bajo evita que Vercel lo trate como función).
// Upstash conectado desde Vercel: según la versión de la integración las variables se llaman KV_REST_API_* o
// UPSTASH_REDIS_REST_*, y al conectarla se les puede poner un prefijo (p. ej. STORAGE_KV_REST_API_URL)
export function credentials() {
    const env = process.env;
    for (const [urlName, tokenName] of [['KV_REST_API_URL', 'KV_REST_API_TOKEN'], ['UPSTASH_REDIS_REST_URL', 'UPSTASH_REDIS_REST_TOKEN']]) {
        if (env[urlName] && env[tokenName]) return { url: env[urlName], token: env[tokenName] };
    }
    // Con prefijo: o se añade delante (STORAGE_KV_REST_API_URL) o sustituye a "KV" (STORAGE_REST_API_URL)
    for (const key of Object.keys(env).sort()) {
        const match = key.match(/^(.+_)(KV_REST_API|UPSTASH_REDIS_REST|REST_API)_URL$/);
        const token = match && env[`${match[1]}${match[2]}_TOKEN`];
        if (match && /^https?:\/\//.test(env[key] || '') && token) return { url: env[key], token };
    }
    return { url: '', token: '' };
}
