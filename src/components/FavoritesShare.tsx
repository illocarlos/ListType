import { useEffect, useId, useMemo, useRef, useState } from "react";
import { Copy, Heart, MessageCircle, Share2 } from "lucide-react";
import type { listItem } from "../types/types";
import { cleanFavName, mergeFavorites } from "../helpers/favlists";
import {
    favShareErrorText, favShareLink, fetchFavShare, looksLikeListLink, MAX_SHARED_FAVORITES, readFavCode, type FavCopy,
} from "../helpers/favshare";

const primary = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-60";
const outline = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-60";
const quiet = "w-full h-12 rounded-md border border-border bg-surface text-base font-semibold hover:bg-surface-sunk";

// ---------- Enviar mis favoritos ----------

type ShareProps = {
    collectionName: string,
    count: number,
    myName: string,
    onCreate: (from: string) => Promise<string>,
    onPasteCode: (code: string) => void,
};

const PasteFavoritesLink = ({ onCode }: { onCode: (code: string) => void }) => {
    const [text, setText] = useState<string>("");
    const [error, setError] = useState<string>("");
    const inputId = useId();
    const errorId = useId();
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const code = readFavCode(text);
        if (!code) {
            setError(looksLikeListLink(text)
                ? "Ese enlace es de una lista de la compra compartida, no de favoritos. Pégalo en «Compartir la lista»."
                : "Ese enlace no vale. Pega el enlace entero o el código que te han pasado.");
            return;
        }
        setError("");
        onCode(code);
    };
    return (
        <form onSubmit={submit} noValidate className="mt-6 border-t border-border pt-4">
            <label htmlFor={inputId} className="block text-base font-semibold">¿Te han pasado favoritos?</label>
            <p className="text-sm text-muted">Pega aquí el enlace para verlos y elegir qué hacer con ellos.</p>
            <div className="mt-2 flex gap-2">
                <input
                    id={inputId}
                    type="text"
                    value={text}
                    onChange={event => setText(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="https://mercalista.vercel.app/#favoritos=…"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="h-12 min-w-0 flex-1 rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                />
                <button type="submit" className="h-12 flex-none rounded-md bg-accent-soft px-4 text-base font-semibold text-on-accent-soft">
                    Abrir
                </button>
            </div>
            {error && <p id={errorId} role="alert" className="mt-2 text-base font-semibold text-danger">{error}</p>}
        </form>
    );
};

export const ShareFavoritesPanel = ({ collectionName, count, myName, onCreate, onPasteCode }: ShareProps) => {
    const [from, setFrom] = useState<string>(myName);
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [code, setCode] = useState<string | null>(null);
    const [copied, setCopied] = useState<boolean>(false);
    const nameId = useId();
    const linkId = useId();
    const whatsappRef = useRef<HTMLAnchorElement>(null);

    // Recién creado: el foco va a «Enviar por WhatsApp», que es lo siguiente que se hace
    useEffect(() => {
        if (code) whatsappRef.current?.focus();
    }, [code]);

    const create = async () => {
        setBusy(true);
        setError("");
        try {
            setCode(await onCreate(from));
        } catch (failure) {
            setError(favShareErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    if (code) {
        const link = favShareLink(code);
        const message = `Te paso mis favoritos de MercaLista. Ábrelos aquí y elige si los unes a los tuyos o los guardas aparte: ${link}`;
        return (
            <div className="p-4">
                <p className="text-base font-semibold" role="status">Enlace creado. Envíalo a quien quieras.</p>
                <label htmlFor={linkId} className="sr-only">Enlace de los favoritos</label>
                <input
                    id={linkId}
                    readOnly
                    value={link}
                    onFocus={event => event.currentTarget.select()}
                    className="mt-2 h-12 w-full rounded-md border-2 border-border-input bg-surface-sunk px-3 text-sm"
                />
                <div className="mt-3 grid gap-2 sm:grid-cols-2">
                    <a
                        ref={whatsappRef}
                        href={`https://wa.me/?text=${encodeURIComponent(message)}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong"
                    >
                        <MessageCircle size={20} aria-hidden="true" />
                        Enviar por WhatsApp
                    </a>
                    <button
                        type="button"
                        onClick={() => navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false))}
                        className="h-12 inline-flex items-center justify-center gap-2 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft"
                    >
                        <Copy size={20} aria-hidden="true" />
                        Copiar enlace
                    </button>
                </div>
                <div role="status" aria-live="polite">
                    {copied && <p className="mt-2 text-base font-semibold">Enlace copiado.</p>}
                </div>
                <p className="mt-3 text-sm text-muted">
                    Es una copia de los favoritos de ahora. Lo que añadas o quites después no le llega; para enviar la versión nueva, crea otro enlace.
                    El enlace funciona 90 días.
                </p>
            </div>
        );
    }

    return (
        <div className="p-4">
            <p className="text-base">
                Manda una copia de «{collectionName}» ({count} {count === 1 ? "producto" : "productos"}). Quien la abra elige si la une a sus favoritos o la guarda aparte.
            </p>
            <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
                <li>Es una copia de hoy: después cada uno tiene los suyos, sin conexión entre vosotros.</li>
                <li>No hace falta cuenta: quien tenga el enlace puede ver estos favoritos. Se guardan en internet solo los productos y, si lo pones, tu nombre; a los 90 días se borran.</li>
                <li>Tu lista de la compra no se comparte.</li>
            </ul>
            {count > MAX_SHARED_FAVORITES && (
                <p role="status" className="mt-3 rounded-md bg-highlight p-3 text-base font-semibold text-on-highlight">
                    Tienes {count}: se enviarán los primeros {MAX_SHARED_FAVORITES}.
                </p>
            )}
            <div className="mt-4">
                <label htmlFor={nameId} className="block text-base font-semibold">Tu nombre (opcional)</label>
                <p className="text-sm text-muted">Así sabrán de quién son.</p>
                <input
                    id={nameId}
                    type="text"
                    value={from}
                    onChange={event => setFrom(event.target.value)}
                    maxLength={30}
                    autoComplete="given-name"
                    autoCapitalize="words"
                    placeholder="Por ejemplo: Ana"
                    className="mt-1 h-12 w-full rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                />
            </div>
            <button type="button" onClick={create} disabled={busy || count === 0} className={`mt-4 ${primary}`}>
                <Share2 size={20} aria-hidden="true" />
                {busy ? "Creando el enlace…" : "Crear enlace para compartir"}
            </button>
            {count === 0 && <p className="mt-2 text-base text-muted">Esta colección está vacía: añade favoritos con el corazón y vuelve.</p>}
            {error && <p role="alert" className="mt-2 text-base font-semibold text-danger">{error}</p>}
            <PasteFavoritesLink onCode={onPasteCode} />
        </div>
    );
};

// ---------- Recibir favoritos ----------

type ReceiveProps = {
    code: string,
    mine: listItem[],
    currentName: string,
    canAddCollection: boolean,
    onMerge: (items: listItem[]) => number,
    onSaveApart: (name: string, items: listItem[]) => void,
    onCancel: () => void,
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

// Hoja al abrir un enlace de favoritos: se ve qué traen y se elige unirlos a los míos o guardarlos aparte.
export const ReceiveFavoritesPanel = ({ code, mine, currentName, canAddCollection, onMerge, onSaveApart, onCancel }: ReceiveProps) => {
    const [copy, setCopy] = useState<FavCopy | null>(null);
    const [error, setError] = useState<string>("");
    const [attempt, setAttempt] = useState<number>(0);
    const [apart, setApart] = useState<boolean>(false);
    const [name, setName] = useState<string>("");
    const [nameError, setNameError] = useState<string>("");
    const nameId = useId();
    const nameRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        let cancelled = false;
        setCopy(null);
        setError("");
        fetchFavShare(code).then(
            result => {
                if (cancelled) return;
                setCopy(result);
                setName(cleanFavName(result.from ? `Favoritos de ${result.from}` : result.name));
            },
            failure => {
                if (!cancelled) setError(favShareErrorText(failure));
            },
        );
        return () => {
            cancelled = true;
        };
    }, [code, attempt]);

    const merge = useMemo(() => copy ? mergeFavorites(mine, copy.items) : null, [mine, copy]);

    if (error) {
        return (
            <div className="p-4">
                <p role="alert" className="text-base font-semibold text-danger">{error}</p>
                <div className="mt-4 space-y-2">
                    <button type="button" onClick={() => setAttempt(value => value + 1)} className={outline}>Reintentar</button>
                    <button type="button" onClick={onCancel} className={quiet}>Entendido</button>
                </div>
            </div>
        );
    }
    if (!copy || !merge) {
        return <p role="status" className="p-4 text-base">Abriendo los favoritos que te han pasado…</p>;
    }

    const saveApart = (event: React.FormEvent) => {
        event.preventDefault();
        if (!cleanFavName(name)) {
            setNameError("Ponle un nombre para guardarlos aparte.");
            nameRef.current?.focus();
            return;
        }
        onSaveApart(name, copy.items);
    };
    const total = copy.items.length;
    const known = total - merge.added;
    const sample = copy.items.slice(0, 4).map(item => item.name).join(", ");

    return (
        <div className="p-4">
            <p className="flex items-start gap-2 text-base">
                <Heart size={22} aria-hidden="true" className="mt-0.5 flex-none text-danger" />
                <span>
                    {copy.from ? <><strong className="break-words">{copy.from}</strong> te comparte</> : "Te han compartido"}
                    {" "}«<span className="break-words">{copy.name || "sus favoritos"}</span>»: <strong>{plural(total, "producto", "productos")}</strong>.
                </span>
            </p>
            {sample && <p className="mt-1 text-sm text-muted">{sample}{total > 4 ? "…" : ""}</p>}
            <p className="mt-3 text-base">¿Qué quieres hacer con ellos?</p>

            <div className="mt-3 space-y-2">
                <button
                    type="button"
                    disabled={merge.added === 0}
                    onClick={() => onMerge(copy.items)}
                    className={primary}
                >
                    {merge.added === 0 ? "Ya los tienes todos" : `Unirlos a «${currentName}»`}
                </button>
                <p className="text-sm text-muted">
                    {merge.added === 0
                        ? "No se añade nada: todos están ya en tus favoritos."
                        : `Se añaden ${plural(merge.added, "producto nuevo", "productos nuevos")}${known > 0 ? ` y ${plural(known, "se queda", "se quedan")} como estaba${known === 1 ? "" : "n"}` : ""}. Lo tuyo no se toca.`}
                </p>

                {apart ? (
                    <form onSubmit={saveApart} noValidate className="rounded-md border-2 border-accent bg-surface p-3">
                        <label htmlFor={nameId} className="block text-base font-semibold">Nombre de la colección</label>
                        <p className="text-sm text-muted">Aparecerá en tus favoritos junto a las demás.</p>
                        <input
                            id={nameId}
                            ref={nameRef}
                            type="text"
                            value={name}
                            onChange={event => {
                                setName(event.target.value);
                                if (nameError && cleanFavName(event.target.value)) setNameError("");
                            }}
                            maxLength={40}
                            required
                            aria-required="true"
                            autoComplete="off"
                            autoFocus
                            aria-invalid={nameError ? true : undefined}
                            className="mt-1 h-12 w-full rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                        />
                        {nameError && <p role="alert" className="mt-2 text-base font-semibold text-danger">{nameError}</p>}
                        <div className="mt-2 flex gap-2">
                            <button type="submit" className="h-12 flex-1 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong">Guardar y abrir</button>
                            <button type="button" onClick={() => setApart(false)} className="h-12 flex-1 rounded-md border border-border bg-surface text-base font-semibold">Atrás</button>
                        </div>
                    </form>
                ) : (
                    <button type="button" disabled={!canAddCollection} onClick={() => setApart(true)} className={outline}>
                        Guardarlos aparte, con su nombre
                    </button>
                )}
                {!canAddCollection && !apart && <p className="text-sm text-muted">Tienes el máximo de colecciones. Borra alguna para guardar esta aparte.</p>}
                <button type="button" onClick={onCancel} className={quiet}>Ahora no</button>
            </div>
        </div>
    );
};
