import { useId, useState } from "react";
import { MapPin } from "lucide-react";
import type { Zone } from "../helpers/mercadona";

type ZoneCardProps = {
    zone: Zone | null,
    onChange: (postalCode: string) => Promise<string | null>,
}

// Zona de precios: el usuario solo escribe su código postal. Nada de códigos de almacén.
const ZoneCard = ({ zone, onChange }: ZoneCardProps) => {
    const [editing, setEditing] = useState<boolean>(false);
    const [value, setValue] = useState<string>(zone?.postalCode ?? "");
    const [error, setError] = useState<string>("");
    const [saving, setSaving] = useState<boolean>(false);
    const [done, setDone] = useState<string>("");
    const inputId = useId();
    const helpId = useId();
    const errorId = useId();

    const open = !zone || editing;

    const submit = async (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        setSaving(true);
        setError("");
        setDone("");
        const message = await onChange(value);
        setSaving(false);
        if (message) {
            setError(message);
            return;
        }
        setEditing(false);
        setDone(`Listo: ya ves los precios de tu zona (${value.replace(/\D/g, "")}).`);
    };

    if (!open && zone) {
        return (
            <div className="mb-4 flex items-center justify-between gap-3 rounded-md bg-surface px-4 py-2">
                <p className="flex items-center gap-2 text-sm">
                    <MapPin size={18} aria-hidden="true" className="flex-none text-accent" />
                    <span>Precios de tu zona: <strong className="tabular">{zone.postalCode}</strong></span>
                </p>
                <button
                    type="button"
                    onClick={() => { setValue(zone.postalCode); setEditing(true); setDone(""); }}
                    className="flex-none h-11 px-3 text-sm font-semibold text-accent underline underline-offset-2"
                >
                    Cambiar
                </button>
                <p role="status" className="sr-only">{done}</p>
            </div>
        );
    }

    return (
        <section aria-labelledby={`${inputId}-title`} className="mb-5 rounded-md bg-surface p-4 border-2 border-accent">
            <h2 id={`${inputId}-title`} className="flex items-center gap-2 text-lg font-bold">
                <MapPin size={22} aria-hidden="true" className="flex-none text-accent" />
                ¿Dónde haces la compra?
            </h2>
            <p id={helpId} className="mt-1 text-base text-muted">
                Escribe tu código postal para ver los precios de tu Mercadona.
            </p>

            <form onSubmit={submit} className="mt-4 flex flex-col gap-3" noValidate>
                <label htmlFor={inputId} className="text-base font-semibold">Código postal</label>
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
                        disabled={saving}
                        aria-busy={saving}
                        className="flex-1 h-14 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-70"
                    >
                        {saving ? "Buscando tu zona…" : "Ver precios de mi zona"}
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
        </section>
    );
};

export default ZoneCard;
