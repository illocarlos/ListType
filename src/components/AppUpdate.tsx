import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { hasNewVersion, reloadApp } from "../helpers/appUpdate";
import { isStandalone } from "../helpers/install";

// Tiempo fuera de la app a partir del cual volver a ella cuenta como "abrirla de nuevo"
const AWAY_MS = 2 * 60 * 1000;
// Distancia (en píxeles, ya con resistencia) que hay que tirar para actualizar
const PULL_THRESHOLD = 70;
const PULL_MAX = 110;

// Mantiene la app al día:
// 1) Al volver a la app tras un rato fuera, si hay versión nueva se recarga sola (si aún no se ha tocado nada).
//    Si no es buen momento (ya se está usando, hay una ventana abierta), avisa con un botón "Actualizar ahora".
// 2) En la app instalada (sin barra del navegador), tirar hacia abajo desde arriba del todo la recarga,
//    como en muchas apps. En el navegador normal no se activa: ya tiene su propio gesto y botón de recargar.
const AppUpdate = () => {
    const [available, setAvailable] = useState<boolean>(false);
    const [pull, setPull] = useState<number>(0);
    const [reloading, setReloading] = useState<boolean>(false);
    const pullRef = useRef<number>(0);

    // 1) Comprobación de versión
    useEffect(() => {
        let hiddenAt = 0;
        let usedSinceVisible = false;
        let checking = false;

        const check = async (canReloadNow: boolean) => {
            if (checking) return;
            checking = true;
            try {
                if (!(await hasNewVersion())) return;
                const busy = usedSinceVisible || document.querySelector('[role="dialog"]') !== null;
                if (canReloadNow && !busy) {
                    setReloading(true);
                    reloadApp();
                } else {
                    setAvailable(true);
                }
            } finally {
                checking = false;
            }
        };

        const onVisibility = () => {
            if (document.visibilityState === "hidden") {
                hiddenAt = Date.now();
                return;
            }
            usedSinceVisible = false;
            check(hiddenAt > 0 && Date.now() - hiddenAt >= AWAY_MS);
        };
        const onUse = () => {
            usedSinceVisible = true;
        };

        check(false);
        document.addEventListener("visibilitychange", onVisibility);
        window.addEventListener("pointerdown", onUse, { passive: true });
        window.addEventListener("keydown", onUse);
        const timer = window.setInterval(() => {
            if (document.visibilityState === "visible") check(false);
        }, 60 * 60 * 1000);
        return () => {
            document.removeEventListener("visibilitychange", onVisibility);
            window.removeEventListener("pointerdown", onUse);
            window.removeEventListener("keydown", onUse);
            window.clearInterval(timer);
        };
    }, []);

    // 2) Tirar hacia abajo para actualizar (solo app instalada y pantalla táctil)
    useEffect(() => {
        if (!isStandalone() || !("ontouchstart" in window)) return;
        let startX = 0;
        let startY = 0;
        let tracking = false;

        const setDistance = (value: number) => {
            pullRef.current = value;
            setPull(value);
        };

        const onStart = (event: TouchEvent) => {
            const target = event.target as Element | null;
            tracking = event.touches.length === 1
                && window.scrollY <= 0
                && !target?.closest('[role="dialog"]')
                && document.querySelector('[role="dialog"]') === null;
            if (!tracking) return;
            startX = event.touches[0].clientX;
            startY = event.touches[0].clientY;
        };
        const onMove = (event: TouchEvent) => {
            if (!tracking) return;
            const dy = event.touches[0].clientY - startY;
            const dx = event.touches[0].clientX - startX;
            // Hacia arriba, o más de lado que hacia abajo (p. ej. las pestañas): no es tirar para actualizar
            if (dy <= 0 || Math.abs(dx) > dy) {
                tracking = false;
                setDistance(0);
                return;
            }
            setDistance(Math.min(dy * 0.5, PULL_MAX));
        };
        const onEnd = () => {
            if (!tracking) return;
            tracking = false;
            if (pullRef.current >= PULL_THRESHOLD) {
                setReloading(true);
                reloadApp();
            } else {
                setDistance(0);
            }
        };

        window.addEventListener("touchstart", onStart, { passive: true });
        window.addEventListener("touchmove", onMove, { passive: true });
        window.addEventListener("touchend", onEnd);
        window.addEventListener("touchcancel", onEnd);
        return () => {
            window.removeEventListener("touchstart", onStart);
            window.removeEventListener("touchmove", onMove);
            window.removeEventListener("touchend", onEnd);
            window.removeEventListener("touchcancel", onEnd);
        };
    }, []);

    const ready = pull >= PULL_THRESHOLD;
    const showPull = pull > 0 || reloading;

    return (
        <>
            {showPull && (
                <div
                    aria-hidden="true"
                    data-testid="pull-indicator"
                    className="pointer-events-none fixed inset-x-0 top-0 z-50 flex justify-center safe-top"
                    style={{ transform: `translateY(${reloading ? PULL_THRESHOLD : pull}px)` }}
                >
                    <span className="inline-flex items-center gap-2 rounded-pill bg-surface px-4 py-2 text-sm font-semibold text-text shadow-pop">
                        <RefreshCw
                            size={18}
                            className={`text-accent-strong ${reloading ? "motion-safe:animate-spin" : ""}`}
                            style={reloading ? undefined : { transform: `rotate(${pull * 3}deg)` }}
                        />
                        {reloading ? "Actualizando…" : ready ? "Suelta para actualizar" : "Desliza para actualizar"}
                    </span>
                </div>
            )}

            {/* La zona de aviso existe siempre para que el lector de pantalla anuncie el mensaje al aparecer */}
            <div role="status" aria-live="polite">
                {available && !reloading && (
                <div className="mb-4 flex flex-wrap items-center gap-3 rounded-md bg-highlight p-3 text-on-highlight">
                    <p className="flex-1 text-base font-semibold">Hay una versión nueva de la app.</p>
                    <button
                        type="button"
                        onClick={() => {
                            setReloading(true);
                            reloadApp();
                        }}
                        className="h-11 px-4 inline-flex items-center gap-2 rounded-pill bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong"
                    >
                        <RefreshCw size={18} aria-hidden="true" />
                        Actualizar ahora
                    </button>
                </div>
                )}
            </div>
        </>
    );
};

export default AppUpdate;
