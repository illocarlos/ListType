import { useEffect, useState } from "react";

// ¿Cumple ahora la pantalla esta media query? Se actualiza al girar el móvil o cambiar el tamaño de la ventana.
export default function useMediaQuery(query: string): boolean {
    const [matches, setMatches] = useState<boolean>(() =>
        typeof window !== "undefined" && typeof window.matchMedia === "function" && window.matchMedia(query).matches
    );

    useEffect(() => {
        if (typeof window.matchMedia !== "function") return;
        const list = window.matchMedia(query);
        const update = () => setMatches(list.matches);
        update();
        list.addEventListener("change", update);
        return () => list.removeEventListener("change", update);
    }, [query]);

    return matches;
}
