import { useId, useState } from "react";
import type { ReactNode } from "react";
import { ChevronDown } from "lucide-react";

type CollapsibleProps = {
    title: string,
    count: number,
    defaultOpen?: boolean,
    children: ReactNode,
}

// Sección plegable (subcategoría de un pasillo, sección de Rebajas o Novedades).
// Cerrada solo se ve el nombre y cuántos productos tiene; así un pasillo largo cabe en una pantalla.
// Los productos solo se pintan al abrirla.
const Collapsible = ({ title, count, defaultOpen = false, children }: CollapsibleProps) => {
    const [open, setOpen] = useState<boolean>(defaultOpen);
    const panelId = useId();

    return (
        <div>
            <h3>
                <button
                    type="button"
                    aria-expanded={open}
                    aria-controls={panelId}
                    onClick={() => setOpen(value => !value)}
                    className={`w-full min-h-[56px] px-4 py-2 flex items-center gap-3 rounded-md border text-left text-base font-bold ${open ? "bg-accent-soft border-accent-soft text-on-accent-soft" : "bg-surface border-border hover:border-accent"}`}
                >
                    <span className="min-w-0 flex-1 break-words">{title}</span>
                    <span className="flex-none text-sm font-semibold text-muted tabular">
                        {count} {count === 1 ? "producto" : "productos"}
                    </span>
                    <ChevronDown size={20} aria-hidden="true" className={`flex-none transition-transform duration-200 motion-reduce:transition-none ${open ? "rotate-180" : ""}`} />
                </button>
            </h3>
            <div id={panelId} hidden={!open} className="pt-2 pb-2">
                {open && children}
            </div>
        </div>
    );
};

export default Collapsible;
