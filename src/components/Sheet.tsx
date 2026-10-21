import { useEffect, useRef } from "react";
import { X } from "lucide-react";

type SheetProps = {
    open: boolean,
    title: string,
    onClose: () => void,
    children: React.ReactNode,
    // "bottom": hoja inferior en móvil y diálogo centrado en escritorio; "full": pantalla completa en móvil
    variant?: "bottom" | "full",
}

const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Diálogo accesible: el foco entra al abrir, no se escapa con el tabulador y vuelve al botón que lo abrió
const Sheet = ({ open, title, onClose, children, variant = "bottom" }: SheetProps) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const opener = document.activeElement as HTMLElement | null;
        const panel = panelRef.current;
        // El foco va al propio diálogo: el lector de pantalla lee su título
        panel?.focus();

        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") {
                onClose();
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
            document.body.style.overflow = previousOverflow;
            opener?.focus?.();
        };
    }, [open, onClose]);

    if (!open) return null;

    const titleId = `sheet-${variant}-title`;
    const panelShape = variant === "full"
        ? "inset-0 safe-top md:pt-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:max-h-[85vh] md:rounded-lg"
        : "inset-x-0 bottom-0 rounded-t-lg md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:rounded-lg";

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className={`absolute ${panelShape} bg-surface shadow-pop flex flex-col overflow-hidden focus:outline-none`}
            >
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                    <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                    <button
                        type="button"
                        onClick={onClose}
                        className="h-11 px-3 inline-flex items-center gap-1.5 rounded-pill text-base font-semibold hover:bg-surface-sunk"
                    >
                        <X size={20} aria-hidden="true" />
                        Cerrar
                    </button>
                </div>
                <div className="flex-1 overflow-y-auto">
                    {children}
                </div>
            </div>
        </div>
    );
};

export default Sheet;
