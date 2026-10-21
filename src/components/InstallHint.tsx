import { useState } from "react";
import { Share, X } from "lucide-react";

const DISMISSED_KEY = "installHintDismissed";

// Solo en iPhone/iPad con Safari y si la app todavía no está instalada
function shouldShow(): boolean {
    if (typeof window === "undefined") return false;
    const ua = navigator.userAgent;
    const isIOS = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
    const standalone = (navigator as Navigator & { standalone?: boolean }).standalone === true
        || window.matchMedia("(display-mode: standalone)").matches;
    let dismissed = false;
    try {
        dismissed = localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
        dismissed = false;
    }
    return isIOS && !standalone && !dismissed;
}

const InstallHint = () => {
    const [visible, setVisible] = useState<boolean>(shouldShow);

    if (!visible) return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            // se volverá a mostrar la próxima vez
        }
        setVisible(false);
    };

    return (
        <aside className="mb-5 flex items-start gap-3 rounded-md bg-accent-soft p-4 text-on-accent-soft" aria-label="Instalar la app">
            <div className="flex-1 text-sm">
                <p className="font-semibold">Tenla como app en tu iPhone</p>
                <p className="mt-1">
                    Toca <Share size={16} aria-label="Compartir" className="inline align-text-bottom" /> en Safari y elige
                    «Añadir a pantalla de inicio». Se abrirá a pantalla completa y funcionará sin cobertura.
                </p>
                <p className="mt-1 text-xs">La app instalada guarda su propia lista: vuelve a apuntar ahí lo que tengas aquí.</p>
            </div>
            <button
                type="button"
                onClick={dismiss}
                aria-label="Cerrar aviso de instalación"
                className="flex-none h-9 w-9 grid place-items-center rounded-full hover:bg-surface"
            >
                <X size={18} aria-hidden="true" />
            </button>
        </aside>
    );
};

export default InstallHint;
