import { useEffect, useState } from "react";
import { ArrowUp } from "lucide-react";

// Botón "Volver arriba": aparece al bajar algo más de una pantalla.
// En el móvil va a la izquierda, encima de la barra "Ver lista", para no tapar los botones + de la derecha.
// Al pulsarlo, el foco pasa al título de la app para que el teclado y el lector de pantalla también "suban".
const BackToTop = ({ focusTargetId }: { focusTargetId: string }) => {
    const [visible, setVisible] = useState<boolean>(false);

    useEffect(() => {
        const update = () => setVisible(window.scrollY > window.innerHeight * 1.2);
        update();
        window.addEventListener("scroll", update, { passive: true });
        window.addEventListener("resize", update);
        return () => {
            window.removeEventListener("scroll", update);
            window.removeEventListener("resize", update);
        };
    }, []);

    if (!visible) return null;

    const goTop = () => {
        const reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" });
        document.getElementById(focusTargetId)?.focus({ preventScroll: true });
    };

    return (
        <button
            type="button"
            onClick={goTop}
            className="fixed left-4 z-30 bottom-[calc(96px+env(safe-area-inset-bottom,0px))] md:bottom-6 h-12 px-4 inline-flex items-center gap-2 rounded-pill bg-surface text-accent-strong text-base font-bold shadow-pop border border-border"
        >
            <ArrowUp size={20} aria-hidden="true" />
            Volver arriba
        </button>
    );
};

export default BackToTop;
