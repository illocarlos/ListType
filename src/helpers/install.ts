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

export function isStandalone(): boolean {
    return (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia("(display-mode: standalone)").matches;
}

export function isIOS(): boolean {
    const ua = navigator.userAgent;
    return /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
}

// Qué se le puede ofrecer a este usuario en este navegador
export function getInstallMode(): InstallMode {
    if (installed || isStandalone()) return "installed";
    if (deferredPrompt) return "button";
    if (isIOS()) return "ios";
    if (/Android/i.test(navigator.userAgent)) return "android-menu";
    return "none";
}

// Abre el diálogo oficial de instalación (solo si el navegador lo ha ofrecido)
export async function promptInstall(): Promise<"accepted" | "dismissed" | "unavailable"> {
    const event = deferredPrompt;
    if (!event) return "unavailable";
    deferredPrompt = null; // el navegador solo deja usarlo una vez
    await event.prompt();
    const { outcome } = await event.userChoice;
    if (outcome === "accepted") installed = true;
    notify();
    return outcome;
}
