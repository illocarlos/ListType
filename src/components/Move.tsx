import { useEffect, useId, useState } from "react";
import { ClipboardPaste, Truck } from "lucide-react";
import type { listItem, orderItem } from "../types/types";
import { applyMove, buildMoveCode, dismissMove, MOVE_HASH, moveDismissed, NEW_HOST, NEW_ORIGIN, readMoveCode, takeMoveResult } from "../helpers/move";

// Dirección vieja: aviso de mudanza con un botón que lleva los datos a la app nueva.
// El botón es un enlace (se abre en el mismo toque, sin bloqueos de ventanas) que además copia el código.
export const MoveBanner = ({ order, favorites }: { order: orderItem[], favorites: listItem[] }) => {
    const [code, setCode] = useState<string>("");
    const [copied, setCopied] = useState<boolean>(false);
    const codeId = useId();

    useEffect(() => {
        let alive = true;
        buildMoveCode(order, favorites).then(value => {
            if (alive) setCode(value);
        }).catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [order, favorites]);

    const copy = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!code) {
            event.preventDefault();
            return;
        }
        navigator.clipboard?.writeText(code).then(() => setCopied(true), () => undefined);
    };

    return (
        <section aria-labelledby="move-title" className="mb-5 rounded-md border-2 border-accent bg-surface p-4">
            <h2 id="move-title" className="flex items-center gap-2 text-lg font-bold">
                <Truck size={22} aria-hidden="true" className="flex-none text-accent" />
                La app se ha mudado
            </h2>
            <p className="mt-1 text-base">
                Ahora está en <strong>{NEW_HOST}</strong>. Lleva tu lista ({order.length}) y tus favoritos ({favorites.length}) con un toque:
            </p>
            <a
                href={code ? `${NEW_ORIGIN}/${MOVE_HASH}${code}` : NEW_ORIGIN}
                target="_blank"
                rel="noopener noreferrer"
                onClick={copy}
                aria-disabled={!code}
                className={`mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong ${code ? "" : "opacity-50"}`}
            >
                Llevar mis datos a la app nueva
            </a>
            <div role="status" aria-live="polite">
                {copied && (
                    <p className="mt-2 text-base font-semibold">
                        Datos copiados. Si la app nueva no los enseña, pulsa allí «Pegar mis datos».
                    </p>
                )}
            </div>
            <p className="mt-3 text-sm text-muted">
                En el iPhone: en la app nueva toca Compartir y «Añadir a pantalla de inicio», ábrela desde el icono nuevo
                (se llama MercaLista) y pulsa «Pegar mis datos». Después puedes borrar este icono.
            </p>
            <details className="mt-1">
                <summary className="inline-flex h-11 cursor-pointer items-center text-sm font-semibold text-accent-strong underline underline-offset-2">
                    ¿No funciona? Copiar el código a mano
                </summary>
                <label htmlFor={codeId} className="mt-1 block text-sm text-muted">Mantén pulsado el recuadro, elige «Seleccionar todo» y «Copiar»:</label>
                <textarea
                    id={codeId}
                    readOnly
                    value={code}
                    rows={3}
                    onFocus={event => event.currentTarget.select()}
                    className="mt-1 w-full rounded-md border-2 border-border-input bg-surface p-2 text-sm break-all"
                />
            </details>
        </section>
    );
};

// Dirección nueva, sin lista ni favoritos: ofrece pegar los datos traídos de la app vieja.
// Tras guardarlos se recarga la app (la lista y los favoritos se leen al arrancar).
export const MoveImport = () => {
    const [dismissed, setDismissed] = useState<boolean>(moveDismissed);
    const [text, setText] = useState<string>("");
    const [error, setError] = useState<string>("");
    const [busy, setBusy] = useState<boolean>(false);
    const textId = useId();
    const errorId = useId();

    if (dismissed) return null;

    const importText = async (value: string) => {
        setBusy(true);
        setError("");
        try {
            applyMove(await readMoveCode(value));
            location.reload();
        } catch {
            setError("Ese código no vale. Vuelve a la app vieja, pulsa «Llevar mis datos» y prueba otra vez.");
            setBusy(false);
        }
    };

    const paste = async () => {
        let value: string;
        try {
            value = await navigator.clipboard.readText();
        } catch {
            setError("No se ha podido leer lo copiado. Mantén pulsado el recuadro de abajo y elige «Pegar».");
            return;
        }
        await importText(value);
    };

    return (
        <section aria-labelledby="import-title" className="mb-5 rounded-md border-2 border-accent bg-surface p-4">
            <h2 id="import-title" className="flex items-center gap-2 text-lg font-bold">
                <ClipboardPaste size={22} aria-hidden="true" className="flex-none text-accent" />
                ¿Vienes de la app anterior?
            </h2>
            <p className="mt-1 text-base">Trae tu lista y tus favoritos: en la app vieja pulsa «Llevar mis datos» y luego aquí:</p>
            <button
                type="button"
                onClick={paste}
                disabled={busy}
                className="mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-50"
            >
                <ClipboardPaste size={20} aria-hidden="true" />
                Pegar mis datos
            </button>
            <label htmlFor={textId} className="mt-4 block text-base font-semibold">O pega aquí el código</label>
            <textarea
                id={textId}
                value={text}
                onChange={event => setText(event.target.value)}
                rows={2}
                aria-describedby={error ? errorId : undefined}
                aria-invalid={error ? true : undefined}
                className="mt-1 w-full rounded-md border-2 border-border-input bg-surface p-2 text-base"
            />
            <button
                type="button"
                onClick={() => importText(text)}
                disabled={busy || !text.trim()}
                className="mt-2 w-full h-12 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold disabled:opacity-50"
            >
                Traer los datos
            </button>
            {error && <p id={errorId} role="alert" className="mt-2 text-base text-danger">{error}</p>}
            <button
                type="button"
                onClick={() => {
                    dismissMove();
                    setDismissed(true);
                }}
                className="mt-2 h-11 px-1 text-sm font-semibold text-muted underline underline-offset-2"
            >
                No, empezar de cero
            </button>
        </section>
    );
};

// Aviso, una sola vez, de lo que se ha traído
export const MoveResult = () => {
    const [result, setResult] = useState<ReturnType<typeof takeMoveResult>>(null);

    useEffect(() => {
        const taken = takeMoveResult();
        if (taken) setResult(taken);
    }, []);

    return (
        <div role="status" aria-live="polite">
            {result && (
                <p className="mb-4 rounded-md bg-accent-soft p-3 text-base font-semibold text-on-accent-soft">
                    {"error" in result
                        ? "No se han podido traer los datos con el enlace. Pulsa «Pegar mis datos» más abajo."
                        : `Datos traídos: ${result.products} ${result.products === 1 ? "producto" : "productos"} en la lista y ${result.favorites} ${result.favorites === 1 ? "favorito" : "favoritos"}.`}
                </p>
            )}
        </div>
    );
};
