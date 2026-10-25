// Instalación de la app (PWA).
// - Android y ordenador (Chrome, Edge, Samsung Internet): el navegador lanza "beforeinstallprompt";
//   se guarda y nuestro botón "Instalar la app" abre el diálogo oficial del sistema.
// - iPhone/iPad: Apple no permite instalar desde un botón. Solo se puede guiar paso a paso.

type InstallPromptEvent = Event & {
    prompt: () => Promise<void>,
    userChoice: Promise<{ outcome: "accepted" | "dismissed" }>,
};

let deferredPrompt: InstallPromptEvent | null = null;
let installed = false;
const listeners = new Set<() => void>();
const notify = () => listeners.forEach(listener => listener());

// Se llama una sola vez al arrancar, antes de pintar la app, para no perder el aviso del navegador
export function captureInstallPrompt() {
    window.addEventListener("beforeinstallprompt", event => {
        event.preventDefault();
        deferredPrompt = event as InstallPromptEvent;
        notify();
    });
    window.addEventListener("appinstalled", () => {
        deferredPrompt = null;
        installed = true;
        notify();
    });
}

export function subscribeInstall(listener: () => void) {
    listeners.add(listener);
    return () => {
        listeners.delete(listener);
    };
}

export type InstallMode = "installed" | "button" | "ios" | "android-menu" | "none";

// Regla del dueño: en un móvil o tableta solo se puede entrar con la cuenta desde la app instalada.
// Es una guía de uso, no una medida de seguridad: el servidor no puede saber desde dónde se abre la web.
// Para quitarla basta con poner esto a false.
export const INSTALL_BEFORE_LOGIN = true;

export function isStandalone(): boolean {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

export function isPhoneOrTablet(): boolean {
    return isIOS() || /Android/i.test(navigator.userAgent);
}

// Navegadores que se abren dentro de otra app (WhatsApp, Instagram, Facebook…): desde ahí no se puede instalar nada.
// Aviso: es una detección aproximada por el agente de usuario; Apple no da una forma segura de saberlo.
export function isInAppBrowser(): boolean {
    const ua = navigator.userAgent;
    if (/FBAN|FBAV|FB_IAB|Instagram|Line\/|MicroMessenger|Snapchat|TikTok|Twitter|GSA\//i.test(ua)) return true;
    if (/Android/i.test(ua)) return /;\s?wv\)/.test(ua);
    // iPhone: Safari, Chrome (CriOS), Firefox (FxiOS) y Edge (EdgiOS) llevan su marca; una vista web sin marca es de otra app
    return isIOS() && !/Safari\/|CriOS|FxiOS|EdgiOS/.test(ua);
}

// true = esta persona está en un móvil, en el navegador y no en la app instalada, y por tanto aún no puede entrar
export function needsInstallFirst(): boolean {
    return INSTALL_BEFORE_LOGIN && isPhoneOrTablet() && !isStandalone();
}

// Qué se le puede ofrecer a este usuario en este navegador
export function getInstallMode(): InstallMode {
    if (installed || isStandalone()) return "installed";
    if (deferredPrompt) return "button";
    if (isIOS()) return "ios";
    if (/Android/i.test(navigator.userAgent)) return "android-menu";
    return "none";
}

export type InstallOutcome = "accepted" | "dismissed" | "unavailable" | "error";

let prompting = false;

// Abre el diálogo oficial de instalación (solo si el navegador lo ha ofrecido).
// El aviso se guarda hasta que la persona contesta: así el botón no cambia por el texto del menú mientras el diálogo está abierto.
// El navegador solo deja usarlo una vez; si falla o se rechaza, se descarta y la app enseña el camino del menú.
export async function promptInstall(): Promise<InstallOutcome> {
    const event = deferredPrompt;
    if (!event || prompting) return "unavailable";
    prompting = true;
    try {
        // Se llama sin esperar nada antes: el navegador solo lo permite dentro del toque del botón
        const [, choice] = await Promise.all([event.prompt(), event.userChoice]);
        const outcome = choice.outcome;
        deferredPrompt = null;
        if (outcome === "accepted") installed = true;
        return outcome;
    } catch {
        deferredPrompt = null;
        return "error";
    } finally {
        prompting = false;
        notify();
    }
}
