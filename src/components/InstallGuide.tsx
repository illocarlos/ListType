import { useState, useSyncExternalStore } from "react";
import { Download, Share } from "lucide-react";
import { getInstallMode, isInAppBrowser, isIOS, promptInstall, subscribeInstall } from "../helpers/install";

// Cómo instalar la app en este móvil: lo que se enseña en el aviso de la portada, en «Tu cuenta» y en la pantalla de entrada.
// - Android y ordenador: botón que abre el diálogo oficial del sistema.
// - iPhone/iPad: pasos, porque Apple no deja instalar desde un botón.
// - Navegador de otra app (WhatsApp, Instagram…): primero hay que abrir la web en Safari/Chrome.
const InstallGuide = ({ onDismissed }: { onDismissed?: () => void }) => {
    const mode = useSyncExternalStore(subscribeInstall, getInstallMode, () => "none" as const);
    const [installing, setInstalling] = useState<boolean>(false);
    const inApp = isInAppBrowser();

    const install = async () => {
        setInstalling(true);
        const outcome = await promptInstall();
        setInstalling(false);
        if (outcome === "dismissed") onDismissed?.();
    };

    if (inApp) {
        return (
            <div role="note" className="mt-3 rounded-md bg-surface-sunk p-3 text-base">
                <p className="font-semibold">Estás en el navegador de otra aplicación</p>
                <p className="mt-1">
                    Desde aquí no se puede instalar. Abre este mismo enlace en {isIOS() ? "Safari" : "Chrome"}: toca el menú
                    (los tres puntos ⋮ o el botón ···) y elige «Abrir en {isIOS() ? "Safari" : "el navegador"}».
                </p>
            </div>
        );
    }

    if (mode === "installed") {
        return (
            <p role="status" className="mt-3 rounded-md bg-surface-sunk p-3 text-base font-semibold">
                Ya está instalada. Ábrela desde su icono en la pantalla de inicio y entra desde ahí.
            </p>
        );
    }

    return (
        <>
            {mode === "button" && (
                <button
                    type="button"
                    onClick={install}
                    disabled={installing}
                    className="mt-3 w-full h-14 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-70"
                >
                    <Download size={22} aria-hidden="true" />
                    {installing ? "Instalando…" : "Instalar la app"}
                </button>
            )}

            {mode === "ios" && (
                <ol className="mt-3 space-y-2 text-base list-decimal pl-6">
                    <li>
                        Toca el botón Compartir <Share size={18} aria-hidden="true" className="inline align-text-bottom" />.
                        Si no lo ves, toca primero el botón ··· de abajo.
                    </li>
                    <li>Toca «Añadir a pantalla de inicio». Puede que tengas que deslizar hacia abajo.</li>
                    <li>Toca «Añadir».</li>
                </ol>
            )}

            {mode === "android-menu" && (
                <p className="mt-3 text-base">
                    Abre el menú del navegador (los tres puntos ⋮) y toca «Instalar app» o «Añadir a pantalla de inicio».
                </p>
            )}
        </>
    );
};

export default InstallGuide;
