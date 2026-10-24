import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { X, ZoomIn } from "lucide-react";
import { largeImageUrl } from "../helpers/mercadona";
import type { listItem } from "../types/types";

type ThumbProps = { item: listItem, size?: "sm" | "md" };

// Cuánto hay que mantener el dedo para que se amplíe (evita que salte al hacer scroll)
const HOLD_MS = 150;
// Si el dedo se mueve más que esto antes, es que la persona está haciendo scroll
const MOVE_TOLERANCE = 10;

// "hold": se ve mientras el dedo está apoyado. "keyboard": abierta con Intro, se cierra con Escape.
type Mode = "closed" | "hold" | "keyboard";

// Estilos que quitan los gestos propios de Safari sobre la foto (menú de guardar imagen,
// selección de texto, arrastrar), que interrumpen el "mantener pulsado"
const NO_SYSTEM_GESTURES: React.CSSProperties = {
    WebkitTouchCallout: "none",
    WebkitUserSelect: "none",
    userSelect: "none",
};

// Miniatura ampliable: mantener pulsado = foto grande; soltar = se quita.
const ZoomableThumb = ({ item, box }: { item: listItem, box: string }) => {
    const [mode, setMode] = useState<Mode>("closed");
    const timer = useRef<number | null>(null);
    const start = useRef<{ x: number, y: number } | null>(null);
    const thumbRef = useRef<HTMLButtonElement>(null);
    const closeRef = useRef<HTMLButtonElement>(null);
    const image = item.image ?? "";

    const clearTimer = () => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
    };

    // Soltar el dedo (o cualquier interrupción) quita la foto
    const release = useCallback(() => {
        if (timer.current !== null) {
            window.clearTimeout(timer.current);
            timer.current = null;
        }
        start.current = null;
        setMode(current => current === "hold" ? "closed" : current);
    }, []);

    useEffect(() => () => clearTimer(), []);

    // Mientras se mantiene: si el "soltar" llega a otro sitio, o la app pasa a segundo plano, también se quita
    useEffect(() => {
        if (mode !== "hold") return;
        const onRelease = () => release();
        const onVisibility = () => {
            if (document.visibilityState !== "visible") release();
        };
        window.addEventListener("pointerup", onRelease, true);
        window.addEventListener("pointercancel", onRelease, true);
        window.addEventListener("touchend", onRelease, true);
        window.addEventListener("touchcancel", onRelease, true);
        window.addEventListener("blur", onRelease);
        document.addEventListener("visibilitychange", onVisibility);
        return () => {
            window.removeEventListener("pointerup", onRelease, true);
            window.removeEventListener("pointercancel", onRelease, true);
            window.removeEventListener("touchend", onRelease, true);
            window.removeEventListener("touchcancel", onRelease, true);
            window.removeEventListener("blur", onRelease);
            document.removeEventListener("visibilitychange", onVisibility);
        };
    }, [mode, release]);

    // Abierta con teclado: el foco va a "Cerrar"; Escape o Tab cierran y el foco vuelve a la miniatura.
    // En fase de captura y sin propagar: si se abrió desde la lista, Escape no cierra también la lista.
    useEffect(() => {
        if (mode !== "keyboard") return;
        const thumb = thumbRef.current;
        closeRef.current?.focus();
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
        clearTimer();
        timer.current = window.setTimeout(() => {
            timer.current = null;
            setMode("hold");
        }, HOLD_MS);
        try {
            event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
            // sin captura también funciona: hay escuchas de respaldo en la ventana
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

    // Teclado (detail === 0): Intro o Espacio abre; con el dedo o el ratón el clic no hace nada
    const onClick = (event: React.MouseEvent<HTMLButtonElement>) => {
        if (event.detail === 0) setMode(current => current === "closed" ? "keyboard" : "closed");
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
                onPointerUp={release}
                onPointerCancel={release}
                onLostPointerCapture={release}
                onClick={onClick}
                onContextMenu={event => event.preventDefault()}
                onDragStart={event => event.preventDefault()}
                style={NO_SYSTEM_GESTURES}
                className={`${box} relative flex-none rounded-sm bg-surface`}
            >
                <img
                    src={image}
                    alt=""
                    loading="lazy"
                    draggable={false}
                    style={NO_SYSTEM_GESTURES}
                    className="pointer-events-none h-full w-full rounded-sm object-contain"
                />
                <span aria-hidden="true" className="pointer-events-none absolute -bottom-1 -right-1 grid h-6 w-6 place-items-center rounded-full border border-border bg-surface text-muted">
                    <ZoomIn size={14} />
                </span>
            </button>

            {mode !== "closed" && createPortal(
                <div
                    className={`fixed inset-0 z-[60] grid place-items-center bg-scrim/80 p-4 ${mode === "hold" ? "pointer-events-none" : ""}`}
                    style={NO_SYSTEM_GESTURES}
                    onClick={mode === "keyboard" ? () => setMode("closed") : undefined}
                    role={mode === "keyboard" ? "dialog" : undefined}
                    aria-modal={mode === "keyboard" ? true : undefined}
                    aria-label={mode === "keyboard" ? `Foto de ${item.name}` : undefined}
                    aria-hidden={mode === "hold" ? true : undefined}
                >
                    <figure className="w-full max-w-[560px] rounded-lg bg-surface p-3 shadow-pop">
                        {/* La miniatura hace de fondo mientras carga la foto grande */}
                        <img
                            src={largeImageUrl(image)}
                            alt={item.name}
                            draggable={false}
                            style={{ ...NO_SYSTEM_GESTURES, backgroundImage: `url("${image}")` }}
                            className="mx-auto aspect-square w-full max-h-[65vh] object-contain bg-contain bg-center bg-no-repeat"
                        />
                        <figcaption className="mt-2 text-center text-base font-semibold">{item.name}</figcaption>
                        {mode === "keyboard" && (
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
