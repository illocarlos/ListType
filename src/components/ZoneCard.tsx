import { useEffect, useId, useRef, useState } from "react";
import { LocateFixed, MapPin } from "lucide-react";
import { LocationError, postalCodeFromLocation } from "../helpers/mercadona";
import type { Zone } from "../helpers/mercadona";

type ZoneCardProps = {
    zone: Zone | null,
    onChange: (postalCode: string) => Promise<string | null>,
}

type Busy = "" | "location" | "postal";

// Zona de precios: el usuario toca "Usar mi ubicación" o escribe su código postal. Nada de códigos de almacén.
const ZoneCard = ({ zone, onChange }: ZoneCardProps) => {
    const [editing, setEditing] = useState<boolean>(false);
    const [value, setValue] = useState<string>(zone?.postalCode ?? "");
    const [error, setError] = useState<string>("");
    const [busy, setBusy] = useState<Busy>("");
    const [done, setDone] = useState<string>("");
    const inputId = useId();
    const helpId = useId();
    const errorId = useId();

    const open = !zone || editing;

    // Al confirmar el código postal el formulario desaparece: el foco pasa a "Cambiar" (no se pierde)
    const changeRef = useRef<HTMLButtonElement>(null);
    const focusChange = useRef<boolean>(false);
    useEffect(() => {
        if (open || !focusChange.current) return;
        focusChange.current = false;
        changeRef.current?.focus({ preventScroll: true });
    }, [open]);

    // Comprueba el código postal con Mercadona y, si va bien, cierra el recuadro
    const applyPostalCode = async (postalCode: string, fromLocation: boolean) => {
        setBusy("postal");
        const message = await onChange(postalCode);
        setBusy("");
        if (message) {
            setError(message);
            return;
        }
        focusChange.current = true;
        setEditing(false);
        setDone(fromLocation
            ? `Listo: por tu ubicación, tu código postal es ${postalCode}. Ya ves los precios de tu zona.`
            : `Listo: ya ves los precios de tu zona (${postalCode}).`);
    };

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setError("");
        setDone("");
        await applyPostalCode(value.replace(/\D/g, ""), false);
    };

    const useLocation = async () => {
        setError("");
        setDone("");
        setBusy("location");
        try {
            const postalCode = await postalCodeFromLocation();
            setValue(postalCode);
            await applyPostalCode(postalCode, true);
        } catch (locationError) {
            setBusy("");
            setError(locationError instanceof LocationError
                ? locationError.message
                : "No se ha podido usar tu ubicación. Escribe el código postal, por favor.");
        }
    };

    return (
        <>
            {/* Aviso para lectores de pantalla: existe siempre para que se lea al cambiar */}
            <p role="status" className="sr-only">{done}</p>

            {!open && zone ? (
                <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-surface px-4 py-2">
                    <p className="flex items-center gap-2 text-sm">
                        <MapPin size={18} aria-hidden="true" className="flex-none text-accent" />
                        <span>Precios de tu zona: <strong className="tabular">{zone.postalCode}</strong></span>
                    </p>
                    <button
                        ref={changeRef}
                        type="button"
                        onClick={() => { setValue(zone.postalCode); setEditing(true); setDone(""); }}
                        className="flex-none h-11 px-3 text-sm font-semibold text-accent underline underline-offset-2"
                    >
                        Cambiar
                    </button>
                </div>
            ) : (
                <section aria-labelledby={`${inputId}-title`} className="mb-5 rounded-md bg-surface p-4 border-2 border-accent">
                    <h2 id={`${inputId}-title`} className="flex items-center gap-2 text-lg font-bold">
                        <MapPin size={22} aria-hidden="true" className="flex-none text-accent" />
                        ¿Dónde haces la compra?
                    </h2>
                    <p id={helpId} className="mt-1 text-base text-muted">
                        Así ves los precios de tu Mercadona.
                    </p>

                    <button
                        type="button"
                        onClick={useLocation}
                        disabled={busy !== ""}
                        aria-busy={busy === "location"}
                        className="mt-4 w-full h-14 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-70"
                    >
                        <LocateFixed size={22} aria-hidden="true" />
                        {busy === "location" ? "Buscando dónde estás…" : "Usar mi ubicación"}
                    </button>
                    <p className="mt-2 text-sm text-muted">
                        El móvil te pedirá permiso. Solo se usa para saber tu código postal; la app no la guarda.
                    </p>

                    <form onSubmit={submit} className="mt-4 flex flex-col gap-3 border-t border-border pt-4" noValidate>
                        <label htmlFor={inputId} className="text-base font-semibold">O escribe tu código postal</label>
                        <input
                            id={inputId}
                            value={value}
                            onChange={event => setValue(event.target.value.replace(/\D/g, "").slice(0, 5))}
                            inputMode="numeric"
                            autoComplete="postal-code"
                            pattern="[0-9]*"
                            placeholder="41300"
                            aria-describedby={error ? `${helpId} ${errorId}` : helpId}
                            aria-invalid={error ? true : undefined}
                            className="h-14 rounded-md border-2 border-border-input bg-surface px-4 text-xl tabular tracking-wide focus:border-accent focus:outline-none"
                        />
                        {error && <p id={errorId} role="alert" className="text-base text-danger">{error}</p>}
                        <div className="flex gap-3">
                            <button
                                type="submit"
                                disabled={busy !== ""}
                                aria-busy={busy === "postal"}
                                className="flex-1 h-14 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-70"
                            >
                                {busy === "postal" ? "Buscando tu zona…" : "Ver precios de mi zona"}
                            </button>
                            {zone && (
                                <button
                                    type="button"
                                    onClick={() => { setEditing(false); setError(""); }}
                                    className="h-14 px-4 rounded-md border-2 border-border bg-surface text-base font-semibold"
                                >
                                    Cancelar
                                </button>
                            )}
                        </div>
                    </form>

                    <p className="mt-2 text-sm text-muted">
                        <a
                            href="https://www.openstreetmap.org/copyright"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex min-h-[44px] items-center underline underline-offset-2"
                        >
                            Ubicación con datos de © colaboradores de OpenStreetMap
                        </a>
                    </p>
                </section>
            )}
        </>
    );
};

export default ZoneCard;
