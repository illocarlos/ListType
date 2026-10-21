import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { largeImageUrl } from "../helpers/mercadona";
import type { listItem } from "../types/types";

type ThumbProps = { item: listItem, size?: "sm" | "md" };

// Cuánto hay que mantener el dedo para que cuente como "mantener pulsado"
const HOLD_MS = 250;
// Si el dedo se mueve más que esto antes, es que la persona está haciendo scroll
const MOVE_TOLERANCE = 10;

type Mode = "closed" | "hold" | "sticky";

// Miniatura que se amplía:
// - mantener pulsado: se ve en grande mientras el dedo sigue apoyado; al soltar, se quita
// - toque corto (o Intro/Espacio con teclado): se queda abierta hasta tocar o pulsar "Cerrar"
const ZoomableThumb = ({ item, box }: { item: listItem, box: string }) => {
    const [mode, setMode] = useState<Mode>("closed");
    const timer = useRef<number | null>(null);
    const start = useRef<{ x: number, y: number } | null>(null);
    // Toque corto pendiente: la foto se abre en el "clic" que el navegador envía justo después.
    // Si se abriera antes, ese clic caería sobre el fondo de la foto y la cerraría al instante.
    const tapPending = useRef<boolean>(false);
    const thumbRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const image = item.image ?? "";

    const clearTimer = () => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    };

    useEffect(() => () => clearTimer(), []);

    // Abierta "fija": Escape cierra, el foco va a "Cerrar" y al cerrar vuelve a la miniatura
    useEffect(() => {
        if (mode !== "sticky") return;
        const thumb = thumbRef.current;
        closeRef.current?.focus();
        // En fase de captura y sin propagar: si la foto se abrió desde la lista (otro diálogo),
        // Escape cierra solo la foto, no la lista
        const onKey = (event: KeyboardEvent) => {
            if (event.key === "Escape" || event.key === "Tab") {
                event.preventDefault();
                event.stopPropagation();
                setMode("closed");
            }
        };
        document.addEventListener("keydown", onKey, true);
        return () => {
            document.removeEventListener("keydown", onKey, true);
            thumb?.focus();
        };
    }, [mode]);

    const onPointerDown = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (event.pointerType === "mouse" && event.button !== 0) return;
        start.current = { x: event.clientX, y: event.clientY };
        tapPending.current = false;
        clearTimer();
        timer.current = window.setTimeout(() => {
            timer.current = null;
            setMode("hold");
        }, HOLD_MS);
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // sin captura también funciona, solo que menos fino
        }
    };

    const onPointerMove = (event: React.PointerEvent<HTMLButtonElement>) => {
        if (timer.current === null || !start.current) return;
        const moved = Math.hypot(event.clientX - start.current.x, event.clientY - start.current.y);
        if (moved > MOVE_TOLERANCE) {
            clearTimer();
            start.current = null;
        }
    };

    const onPointerUp = () => {
        if (timer.current !== null) {
            // Soltó antes de tiempo: toque corto → la foto se abrirá fija en el clic que viene
            clearTimer();
            if (start.current) tapPending.current = true;
        } else {
            setMode(current => current === "hold" ? "closed" : current);
        }
        start.current = null;
    };

    const onPointerCancel = () => {
        clearTimer();
        tapPending.current = false;
        start.current = null;
        setMode(current => current === "hold" ? "closed" : current);
    };

    // Intro o Espacio con el teclado (detail === 0): abre o cierra. Toque o clic corto: abre fija.
    const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) {
            setMode(current => current === "closed" ? "sticky" : "closed");
        } else if (tapPending.current) {
            tapPending.current = false;
            setMode("sticky");
        }
    };

    return (
        <>
            <button
                ref={thumbRef}
                type="button"
                aria-label={`Ver foto grande de ${item.name}`}
                aria-haspopup="dialog"
                onPointerDown={onPointerDown}
                onPointerMove={onPointerMove}
                onPointerUp={onPointerUp}
                onPointerCancel={onPointerCancel}
                onClick={onClick}
                onContextMenu={event => event.preventDefault()}
                style={{ WebkitTouchCallout: "none" }}
                className={`${box} relative flex-none rounded-sm bg-surface select-none`}
            >
                <img src={image} alt="" loading="lazy" draggable={false} className="h-full w-full rounded-sm object-contain" />
                <span aria-hidden="true" className="absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted">
                    <ZoomIn size={14} />
                </span>
            </button>

            {mode !== "closed" && createPortal(
                <div
                    className="fixed inset-0 z-[60] grid place-items-center bg-text/80 p-4"
                    onClick={mode === "sticky" ? () => setMode("closed") : undefined}
                    role={mode === "sticky" ? "dialog" : undefined}
                    aria-modal={mode === "sticky" ? true : undefined}
                    aria-label={mode === "sticky" ? `Foto de ${item.name}` : undefined}
                >
                    <figure className="w-full max-w-[560px] rounded-lg bg-surface p-3 shadow-pop">
                        {/* La miniatura hace de fondo mientras carga la foto grande */}
                        <img
                            src={largeImageUrl(image)}
                            alt={item.name}
                            draggable={false}
                            style={{ backgroundImage: `url("${image}")` }}
                            className="mx-auto aspect-square w-full max-h-[65vh] object-contain bg-contain bg-center bg-no-repeat select-none"
                        />
                        <figcaption className="mt-2 text-center text-base font-semibold">{item.name}</figcaption>
                        {mode === "sticky" && (
                            <button
                                ref={closeRef}
                                type="button"
                                onClick={() => setMode("closed")}
                                className="mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold"
                            >
                                <X size={20} aria-hidden="true" />
                                Cerrar
                            </button>
                        )}
                    </figure>
                </div>,
                document.body
            )}
        </>
    );
};

export const Thumb = ({ item, size = "md" }: ThumbProps) => {
    const box = size === "md" ? "h-14 w-14" : "h-12 w-12";
    if (item.image) return <ZoomableThumb item={item} box={box} />;
    return (
        <span
            aria-hidden="true"
            className={`${box} flex-none rounded-sm bg-surface-sunk text-on-accent-soft grid place-items-center text-lg font-bold`}
        >
            {item.name.trim().charAt(0).toUpperCase()}
        </span>
    );
};

export default Thumb;
