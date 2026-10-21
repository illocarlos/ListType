import { useState, useSyncExternalStore } from "react";
import { Download, Share, X } from "lucide-react";
import { getInstallMode, promptInstall, subscribeInstall } from "../helpers/install";

const DISMISSED_KEY = "installHintDismissed";

function wasDismissed(): boolean {
    try {
        return localStorage.getItem(DISMISSED_KEY) === "1";
    } catch {
        return false;
    }
}

// Invita a instalar la app:
// - Android y ordenador: botón "Instalar la app" que abre el diálogo del sistema (un toque + confirmar).
// - iPhone: pasos claros, porque Apple no deja instalar desde un botón.
const InstallHint = () => {
    const mode = useSyncExternalStore(subscribeInstall, getInstallMode, () => "none" as const);
    const [dismissed, setDismissed] = useState<boolean>(wasDismissed);
    const [installing, setInstalling] = useState<boolean>(false);

    if (dismissed || mode === "installed" || mode === "none") return null;

    const dismiss = () => {
        try {
            localStorage.setItem(DISMISSED_KEY, "1");
        } catch {
            // se volverá a mostrar la próxima vez
        }
        setDismissed(true);
    };

    const install = async () => {
        setInstalling(true);
        const outcome = await promptInstall();
        setInstalling(false);
        if (outcome === "dismissed") dismiss();
    };

    return (
        <aside className="mb-5 rounded-md bg-accent-soft p-4 text-on-accent-soft" aria-labelledby="install-title">
            <div className="flex items-start justify-between gap-3">
                <h2 id="install-title" className="text-base font-bold">Tenla como app en tu móvil</h2>
                <button
                    type="button"
                    onClick={dismiss}
                    aria-label="Cerrar aviso de instalación"
                    className="flex-none -mt-2 -mr-2 h-11 w-11 grid place-items-center rounded-full hover:bg-surface"
                >
                    <X size={20} aria-hidden="true" />
                </button>
            </div>
            <p className="mt-1 text-base">Se abre desde un icono, a pantalla completa, y funciona sin cobertura.</p>

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

            <p className="mt-3 text-sm">La app instalada guarda su propia lista: vuelve a apuntar ahí lo que tengas aquí.</p>
        </aside>
    );
};

export default InstallHint;
