import { useEffect, useState } from "react";
import { Truck } from "lucide-react";
import type { listItem, orderItem } from "../types/types";
import { buildMoveCode, MOVE_HASH, NEW_HOST, NEW_ORIGIN, takeMoveResult } from "../helpers/move";

// Dirección vieja: aviso de mudanza con un botón que lleva los datos a la app nueva.
// El botón es un enlace (se abre en el mismo toque, sin bloqueos de ventanas): el código va en la dirección, tras la #.
export const MoveBanner = ({ order, favorites }: { order: orderItem[], favorites: listItem[] }) => {
    const [code, setCode] = useState<string>("");

    useEffect(() => {
        let alive = true;
        buildMoveCode(order, favorites).then(value => {
            if (alive) setCode(value);
        }).catch(() => undefined);
        return () => {
            alive = false;
        };
    }, [order, favorites]);

    const prevent = (event: React.MouseEvent<HTMLAnchorElement>) => {
        if (!code) event.preventDefault();
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
                onClick={prevent}
                aria-disabled={!code}
                className={`mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong ${code ? "" : "opacity-50"}`}
            >
                Llevar mis datos a la app nueva
            </a>
            <p className="mt-3 text-sm text-muted">
                En la app nueva entra con tu cuenta de Google. En el iPhone, hazlo primero en Safari con este enlace; después abre
                la app nueva desde su icono (se llama MercaLista), entra con la misma cuenta y tendrás tus datos. Después puedes borrar este icono.
            </p>
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
                        ? "No se han podido traer los datos con el enlace. Vuelve a la app vieja y pulsa otra vez «Llevar mis datos»."
                        : `Datos traídos: ${result.products} ${result.products === 1 ? "producto" : "productos"} en la lista y ${result.favorites} ${result.favorites === 1 ? "favorito" : "favoritos"}.`}
                </p>
            )}
        </div>
    );
};
