// ¿Hay una versión nueva de la app publicada?
// Cada publicación en Vercel cambia el nombre del archivo principal (/assets/index-<huella>.js).
// Se pide la página a la red, sin caché, y se compara ese nombre con el que está funcionando ahora.

const SCRIPT_RE = /<script\b[^>]*\bsrc="(\/assets\/index-[^"]+\.js)"/;

function runningScript(): string | null {
    const script = document.querySelector<HTMLScriptElement>('script[type="module"][src*="/assets/index-"]');
    if (!script) return null;
    try {
        return new URL(script.src, location.origin).pathname;
    } catch {
        return null;
    }
}

export async function hasNewVersion(): Promise<boolean> {
    const current = runningScript();
    // En desarrollo no hay huella; sin conexión no se puede saber
    if (!current || !navigator.onLine) return false;
    try {
        const response = await fetch("/", { cache: "no-store", headers: { Accept: "text/html" } });
        if (!response.ok) return false;
        const published = (await response.text()).match(SCRIPT_RE)?.[1];
        return Boolean(published) && published !== current;
    } catch {
        return false;
    }
}

// Recarga la app. La página se pide primero a la red (ver public/sw.js), así que llega la versión nueva;
// la lista, los favoritos y el catálogo están en localStorage y no se pierden.
export function reloadApp() {
    navigator.serviceWorker?.getRegistration()
        .then(registration => registration?.update())
        .catch(() => undefined)
        .finally(() => location.reload());
}
