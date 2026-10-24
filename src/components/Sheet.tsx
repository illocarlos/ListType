import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type SheetProps = {
    open: boolean,
    title: string,
    onClose: () => void,
    children: React.ReactNode,
    // "bottom": hoja inferior en móvil y diálogo centrado en escritorio; "full": pantalla completa en móvil
    variant?: "bottom" | "full",
    // false: no se puede cerrar (sin botón Cerrar, sin Escape, sin tocar fuera, y "atrás" no la quita)
    dismissible?: boolean,
}

// Diálogos abiertos, el último arriba: solo ese atiende al teclado (p. ej. la ficha abierta desde la lista)
const openSheets: symbol[] = [];

// Botón "atrás" del móvil (Android, o el gesto de volver en Safari): cada diálogo abierto añade un paso
// al historial, y "atrás" cierra el de arriba en vez de salir de la app.
// Al cerrar con "Cerrar" o Escape se quita ese paso; el "popstate" que provoca eso no debe cerrar otro diálogo.
// Un solo escuchador para todos: así cada "atrás" cierra exactamente uno, el de arriba.
let ignoreNextPop = 0;
const historyOwners: { close: () => void }[] = [];
if (typeof window !== "undefined") {
    window.addEventListener("popstate", () => {
        if (ignoreNextPop > 0) {
            ignoreNextPop--;
            return;
        }
        historyOwners.pop()?.close();
    });
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogo accesible: el foco entra al abrir, no se escapa con el tabulador y vuelve al botón que lo abrió
const Sheet = ({ open, title, onClose, children, variant = "bottom", dismissible = true }: SheetProps) => {
    const panelRef = useRef<HTMLDivElement>(null);
    const onCloseRef = useRef(onClose);
    onCloseRef.current = onClose;
    const dismissibleRef = useRef(dismissible);
    dismissibleRef.current = dismissible;

    // Historial: un paso por diálogo abierto
    useEffect(() => {
        if (!open) return;
        let closedByBack = false;
        const owner = {
            close: () => {
                // Obligatoria: "atrás" no la quita; se vuelve a poner su paso en el historial
                if (!dismissibleRef.current) {
                    historyOwners.push(owner);
                    window.history.pushState({ sheet: true }, "");
                    return;
                }
                closedByBack = true;
                onCloseRef.current();
            },
        };
        historyOwners.push(owner);
        window.history.pushState({ sheet: true }, "");
        return () => {
            const index = historyOwners.indexOf(owner);
            if (index >= 0) historyOwners.splice(index, 1);
            // Cerrado con el botón o Escape: se quita el paso que se añadió al abrir
            if (!closedByBack) {
                ignoreNextPop++;
                window.history.back();
            }
        };
    }, [open]);

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        const self = Symbol("sheet");
        openSheets.push(self);
        // El foco va al propio diálogo: el lector de pantalla lee su título
        panel?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (openSheets[openSheets.length - 1] !== self) return;
            if (event.key === "Escape") {
                if (dismissibleRef.current) onCloseRef.current();
                return;
            }
            if (event.key !== "Tab" || !panel) return;
            const items = [...panel.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(element => element.offsetParent !== null);
            if (items.length === 0) {
                event.preventDefault();
                return;
            }
            const first = items[0];
            const last = items[items.length - 1];
            const active = document.activeElement;
            const outside = !active || !panel.contains(active);
            if (event.shiftKey && (active === first || active === panel || outside)) {
                event.preventDefault();
                last.focus();
            } else if (!event.shiftKey && (active === last || outside)) {
                event.preventDefault();
                first.focus();
            }
        };

        document.addEventListener("keydown", onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        return () => {
            document.removeEventListener("keydown", onKey);
            const index = openSheets.indexOf(self);
            if (index >= 0) openSheets.splice(index, 1);
            if (openSheets.length === 0) document.body.style.overflow = previousOverflow;
            opener?.focus?.();
        };
    }, [open]);

    if (!open) return null;

    const titleId = `sheet-${title.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}-title`;
    const panelShape = variant === "full"
        ? "inset-0 safe-top md:pt-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:max-h-[85vh] md:rounded-lg"
        : "inset-x-0 bottom-0 max-h-[92dvh] rounded-t-lg md:max-h-[85vh] md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:rounded-lg";

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-scrim/40 dark:bg-scrim/70 anim-sheet-backdrop" onClick={dismissible ? onClose : undefined} aria-hidden="true" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`absolute ${panelShape} bg-surface shadow-pop flex flex-col overflow-hidden focus:outline-none anim-sheet-panel`}
            >
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                    <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                    {dismissible && <button
                        type="button"
                        onClick={onClose}
                        className="h-11 px-3 inline-flex items-center gap-1.5 rounded-pill text-base font-semibold hover:bg-surface-sunk"
                    >
                        <X size={20} aria-hidden="true" />
                        Cerrar
                    </button>}
                </div>
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Sheet;
