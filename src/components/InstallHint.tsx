import { useState, useSyncExternalStore } from "react";
import { X } from "lucide-react";
import { getInstallMode, subscribeInstall } from "../helpers/install";
import InstallGuide from "./InstallGuide";
import { saveImportant } from "../helpers/mercadona";

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

    if (dismissed || mode === "installed" || mode === "none") return null;

    const dismiss = () => {
        // Si no cabe ni haciendo sitio, se volverá a mostrar la próxima vez
        saveImportant(DISMISSED_KEY, "1");
        setDismissed(true);
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

            <InstallGuide onDismissed={dismiss} />

            <p className="mt-3 text-sm">La app instalada guarda su propia lista: vuelve a apuntar ahí lo que tengas aquí.</p>
        </aside>
    );
};

export default InstallHint;
