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

const Sheet = ({ open, title, onClose, children, variant = "bottom" }: SheetProps) => {
    const panelRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        if (!open) return;
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape") onClose();
        };
        document.addEventListener("keydown", onKey);
        const previousOverflow = document.body.style.overflow;
        document.body.style.overflow = "hidden";
        // Foco al primer campo o botón del panel
        const focusable = panelRef.current?.querySelector<HTMLElement>("input, select, button:not([data-close])");
        focusable?.focus();
        return () => {
            document.removeEventListener("keydown", onKey);
            document.body.style.overflow = previousOverflow;
        };
    }, [open, onClose]);

    if (!open) return null;

    const titleId = `sheet-${title.replace(/\s+/g, "-").toLowerCase()}`;
    const panelShape = variant === "full"
        ? "inset-0 md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:max-h-[85vh] md:rounded-lg"
        : "inset-x-0 bottom-0 rounded-t-lg md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:w-[440px] md:rounded-lg";

    return (
        <div className="fixed inset-0 z-50">
            <div className="absolute inset-0 bg-text/40" onClick={onClose} aria-hidden="true" />
            <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                className={`absolute ${panelShape} bg-surface shadow-pop flex flex-col overflow-hidden`}
            >
                <div className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border">
                    <h2 id={titleId} className="text-lg font-bold">{title}</h2>
                    <button
                        type="button"
                        data-close
                        onClick={onClose}
                        aria-label="Cerrar"
                        className="h-11 w-11 grid place-items-center rounded-full hover:bg-surface-sunk"
                    >
                        <X size={20} aria-hidden="true" />
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
