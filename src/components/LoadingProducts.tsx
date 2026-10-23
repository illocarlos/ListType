type LoadingProductsProps = {
    title: string,
    hint?: string,
    rows?: number,
    // En el buscador ya hay un aviso hablado de los resultados: ahí no se repite
    announce?: boolean,
};

// Carga de productos de Mercadona: un aviso con un indicador que gira y filas "fantasma" con la forma de
// las de verdad, para que se vea que algo está llegando (y no que no hay nada).
// No tapa la app: la lista y los favoritos se siguen usando mientras tanto.
// Con "reducir movimiento" activado en el móvil no se anima nada.
const LoadingProducts = ({ title, hint, rows = 4, announce = true }: LoadingProductsProps) => (
    <div aria-busy="true" data-loading>
        <div role={announce ? "status" : undefined} className="flex items-center gap-3 rounded-md bg-surface p-4">
            <span
                aria-hidden="true"
                className="h-8 w-8 flex-none rounded-full border-4 border-accent-soft border-t-accent motion-safe:animate-spin"
            />
            <div className="min-w-0">
                <p className="text-base font-semibold">{title}</p>
                {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
            </div>
        </div>
        <ul aria-hidden="true" className="mt-2 space-y-2">
            {Array.from({ length: rows }).map((_, index) => (
                <li key={index} className="flex gap-3 rounded-md bg-surface px-3 py-2">
                    <span className="mt-1 h-14 w-14 flex-none rounded-sm bg-surface-sunk motion-safe:animate-pulse" />
                    <span className="flex-1 space-y-2 pt-1">
                        <span className="block h-4 w-4/5 rounded-sm bg-surface-sunk motion-safe:animate-pulse" />
                        <span className="block h-4 w-2/5 rounded-sm bg-surface-sunk motion-safe:animate-pulse" />
                        <span className="block h-3 w-1/3 rounded-sm bg-surface-sunk motion-safe:animate-pulse" />
                    </span>
                    <span className="h-11 w-11 flex-none self-end rounded-full bg-surface-sunk motion-safe:animate-pulse" />
                </li>
            ))}
        </ul>
    </div>
);

export default LoadingProducts;
