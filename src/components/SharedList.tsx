import { useEffect, useId, useRef, useState } from "react";
import { Check, Cloud, CloudOff, Copy, LogOut, MessageCircle, RefreshCw, Users } from "lucide-react";
import { readShareCode, shareLink, syncErrorText, type SyncStatus } from "../helpers/sync";
import type { JoinMode } from "../hooks/useList";

const STATUS_TEXT: Record<SyncStatus, string> = {
    local: "",
    syncing: "Enviando cambios…",
    synced: "Al día",
    offline: "Sin conexión: tus cambios se enviarán al volver",
    error: "No se puede conectar ahora; se reintentará solo",
    limit: "Límite gratuito del mes alcanzado: la lista sigue en este móvil",
    gone: "La lista compartida ya no existe. Tu lista sigue en este móvil.",
};

const statusIcon = (status: SyncStatus) => status === "synced"
    ? <Check size={18} aria-hidden="true" className="flex-none text-accent-strong" />
    : status === "syncing"
        ? <RefreshCw size={18} aria-hidden="true" className="flex-none text-accent-strong motion-safe:animate-spin" />
        : status === "local" ? <Cloud size={18} aria-hidden="true" className="flex-none" />
            : <CloudOff size={18} aria-hidden="true" className="flex-none text-danger" />;

// Fila en la cabecera de la lista: compartir o, si ya se comparte, cómo va
export const ShareRow = ({ shared, status, onOpen }: { shared: boolean, status: SyncStatus, onOpen: () => void }) => (
    <div className="flex items-center justify-between gap-3 px-4 py-2 border-b border-border">
        {shared ? (
            <p className="flex min-w-0 items-center gap-2 text-sm font-semibold" role="status">
                <Users size={18} aria-hidden="true" className="flex-none text-accent-strong" />
                <span className="truncate">Compartida · {STATUS_TEXT[status] || "Al día"}</span>
            </p>
        ) : (
            <p className="text-sm text-muted">Solo en este móvil</p>
        )}
        <button
            type="button"
            onClick={onOpen}
            className="flex-none h-11 px-3 inline-flex items-center gap-1.5 rounded-pill border-2 border-accent bg-surface text-base font-semibold text-accent-strong hover:bg-accent-soft"
        >
            <Users size={18} aria-hidden="true" />
            Compartir<span className="sr-only"> la lista</span>
        </button>
    </div>
);

// "¿Te han pasado un enlace?": sobre todo para el iPhone con la app en la pantalla de inicio, que no recibe los enlaces
const PasteLink = ({ onCode }: { onCode: (id: string) => void }) => {
    const [text, setText] = useState<string>("");
    const [error, setError] = useState<string>("");
    const inputId = useId();
    const errorId = useId();
    const submit = (event: React.FormEvent) => {
        event.preventDefault();
        const code = readShareCode(text);
        if (!code) {
            setError("Eso no parece un enlace de MercaLista. Copia el enlace entero que te han enviado.");
            return;
        }
        setError("");
        onCode(code);
    };
    return (
        <form onSubmit={submit} noValidate className="mt-6 border-t border-border pt-4">
            <label htmlFor={inputId} className="block text-base font-semibold">¿Te han pasado un enlace?</label>
            <p className="text-sm text-muted">Pégalo aquí para unirte a esa lista.</p>
            <div className="mt-2 flex gap-2">
                <input
                    id={inputId}
                    type="text"
                    value={text}
                    onChange={event => setText(event.target.value)}
                    autoComplete="off"
                    autoCapitalize="none"
                    spellCheck={false}
                    placeholder="https://mercalista.vercel.app/#lista=…"
                    aria-invalid={error ? true : undefined}
                    aria-describedby={error ? errorId : undefined}
                    className="h-12 min-w-0 flex-1 rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                />
                <button type="submit" className="h-12 flex-none rounded-md bg-accent-soft px-4 text-base font-semibold text-on-accent-soft">
                    Unirme
                </button>
            </div>
            {error && <p id={errorId} role="alert" className="mt-2 text-base font-semibold text-danger">{error}</p>}
        </form>
    );
};

// "Tu nombre" (obligatorio en la lista compartida): con él se firma lo que apuntas ("Apuntado por Ana")
const NameField = ({ value, onChange, error, inputRef }: {
    value: string,
    onChange: (text: string) => void,
    error?: string,
    inputRef?: React.Ref<HTMLInputElement>,
}) => {
    const inputId = useId();
    const helpId = useId();
    const errorId = useId();
    return (
        <div className="mt-4">
            <label htmlFor={inputId} className="block text-base font-semibold">Tu nombre</label>
            <p id={helpId} className="text-sm text-muted">Así los demás ven quién ha apuntado cada cosa.</p>
            <input
                ref={inputRef}
                id={inputId}
                type="text"
                value={value}
                onChange={event => onChange(event.target.value)}
                maxLength={30}
                required
                aria-required="true"
                autoComplete="given-name"
                autoCapitalize="words"
                placeholder="Por ejemplo: Ana"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${errorId} ${helpId}` : helpId}
                className="mt-1 h-12 w-full rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
            />
            {error && <p id={errorId} role="alert" className="mt-2 text-base font-semibold text-danger">{error}</p>}
        </div>
    );
};

const NAME_MISSING = "Escribe tu nombre para seguir.";
const hasName = (text: string) => text.trim().length > 0;

type SharePanelProps = {
    sharedId: string | null,
    status: SyncStatus,
    itemCount: number,
    myName: string,
    onName: (text: string) => void,
    onShare: () => Promise<string>,
    onLeave: () => void,
    onJoinCode: (id: string) => void,
};

// Contenido de la hoja "Compartir la lista"
export const SharePanel = ({ sharedId, status, itemCount, myName, onName, onShare, onLeave, onJoinCode }: SharePanelProps) => {
    const [busy, setBusy] = useState<boolean>(false);
    const [name, setName] = useState<string>(myName);
    const [nameSaved, setNameSaved] = useState<boolean>(false);
    const [nameError, setNameError] = useState<string>("");
    const nameRef = useRef<HTMLInputElement>(null);
    // Sin nombre no se sigue: aviso en el campo y el foco va a él
    const requireName = () => {
        if (hasName(name)) {
            setNameError("");
            return true;
        }
        setNameError(NAME_MISSING);
        nameRef.current?.focus();
        return false;
    };
    const [error, setError] = useState<string>("");
    const [copied, setCopied] = useState<boolean>(false);
    const [confirmLeave, setConfirmLeave] = useState<boolean>(false);
    const linkId = useId();
    const whatsappRef = useRef<HTMLAnchorElement>(null);
    const createdNow = useRef<boolean>(false);

    // Recién creada: el foco va a "Enviar por WhatsApp", que es lo siguiente que se hace
    useEffect(() => {
        if (sharedId && createdNow.current) {
            createdNow.current = false;
            whatsappRef.current?.focus();
        }
    }, [sharedId]);

    const create = async () => {
        if (!requireName()) return;
        setBusy(true);
        setError("");
        try {
            createdNow.current = true;
            onName(name);
            await onShare();
        } catch (failure) {
            createdNow.current = false;
            setError(syncErrorText(failure));
        } finally {
            setBusy(false);
        }
    };

    if (!sharedId) {
        return (
            <div className="p-4">
                <p className="text-base">
                    Varias personas con la misma lista: lo que uno apunta o tacha en la tienda, los demás lo ven en unos segundos.
                </p>
                <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
                    <li>No hace falta cuenta: quien tenga el enlace puede ver y cambiar la lista.</li>
                    <li>Se guardan en internet solo los productos{itemCount ? ` (ahora ${itemCount})` : ""} y el nombre que pongas. Si nadie la toca en 90 días, se borra.</li>
                    <li>Tus favoritos siguen siendo solo tuyos.</li>
                </ul>
                <NameField value={name} onChange={text => {
                    setName(text);
                    if (nameError && hasName(text)) setNameError("");
                }} error={nameError} inputRef={nameRef} />
                <button
                    type="button"
                    onClick={create}
                    disabled={busy}
                    className="mt-4 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-60"
                >
                    <Users size={20} aria-hidden="true" />
                    {busy ? "Creando el enlace…" : "Crear enlace para compartir"}
                </button>
                {error && <p role="alert" className="mt-2 text-base font-semibold text-danger">{error}</p>}
                <PasteLink onCode={code => {
                    if (hasName(name)) onName(name);
                    onJoinCode(code);
                }} />
            </div>
        );
    }

    const link = shareLink(sharedId);
    const message = `Te paso nuestra lista de la compra compartida. Ábrela aquí y la veremos igual en los dos móviles: ${link}`;
    const copy = () => {
        navigator.clipboard?.writeText(link).then(() => setCopied(true), () => setCopied(false));
    };

    return (
        <div className="p-4">
            <p className="flex items-center gap-2 text-base font-semibold" role="status">
                {statusIcon(status)}
                {STATUS_TEXT[status] || "Al día"}
            </p>
            <p className="mt-2 text-base">Envía el enlace a quien quieras que comparta la lista contigo:</p>
            <label htmlFor={linkId} className="sr-only">Enlace de la lista</label>
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
                    onClick={copy}
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
                En un iPhone con la app en la pantalla de inicio, el enlace se abre en Safari: copia el enlace,
                abre la app y pégalo en «¿Te han pasado un enlace?».
            </p>

            <form
                className="mt-2"
                noValidate
                onSubmit={event => {
                    event.preventDefault();
                    if (!requireName()) return;
                    onName(name);
                    setNameSaved(true);
                }}
            >
                <NameField value={name} onChange={text => {
                    setName(text);
                    setNameSaved(false);
                    if (nameError && hasName(text)) setNameError("");
                }} error={nameError} inputRef={nameRef} />
                <button type="submit" className="mt-2 h-11 rounded-md bg-accent-soft px-4 text-base font-semibold text-on-accent-soft">
                    Guardar nombre
                </button>
                <span role="status" className="ml-3 text-base font-semibold">{nameSaved ? "Guardado." : ""}</span>
            </form>

            <div className="mt-6 border-t border-border pt-4">
                {confirmLeave ? (
                    <div className="rounded-md bg-surface-sunk p-3">
                        <p className="text-base">Tu lista se queda en este móvil tal como está, y los demás siguen con la suya.</p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button
                                type="button"
                                onClick={() => {
                                    setConfirmLeave(false);
                                    onLeave();
                                }}
                                className="h-12 flex-1 rounded-md bg-danger px-4 text-base font-semibold text-on-danger"
                            >
                                Sí, dejar de compartir
                            </button>
                            <button
                                type="button"
                                onClick={() => setConfirmLeave(false)}
                                className="h-12 flex-1 rounded-md border border-border bg-surface px-4 text-base font-semibold"
                            >
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirmLeave(true)}
                        className="h-11 px-2 inline-flex items-center gap-2 rounded-md text-base font-semibold text-danger hover:bg-surface-sunk"
                    >
                        <LogOut size={20} aria-hidden="true" />
                        Dejar de compartir en este móvil
                    </button>
                )}
            </div>
            <PasteLink onCode={code => {
                if (hasName(name)) onName(name);
                onJoinCode(code);
            }} />
        </div>
    );
};

type JoinPanelProps = {
    inviteId: string,
    currentSharedId: string | null,
    localCount: number,
    myName: string,
    onName: (text: string) => void,
    onJoin: (mode: JoinMode) => Promise<void>,
    onCancel: () => void,
};

// Contenido de la hoja que sale al abrir un enlace de invitación
export const JoinPanel = ({ inviteId, currentSharedId, localCount, myName, onName, onJoin, onCancel }: JoinPanelProps) => {
    const [busy, setBusy] = useState<boolean>(false);
    const [error, setError] = useState<string>("");
    const [name, setName] = useState<string>(myName);
    const [nameError, setNameError] = useState<string>("");
    const nameRef = useRef<HTMLInputElement>(null);
    const run = async (mode: JoinMode) => {
        if (!hasName(name)) {
            setNameError(NAME_MISSING);
            nameRef.current?.focus();
            return;
        }
        setNameError("");
        setBusy(true);
        setError("");
        onName(name);
        try {
            await onJoin(mode);
        } catch (failure) {
            setError(syncErrorText(failure));
            setBusy(false);
        }
    };
    const primary = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-60";
    const secondary = "w-full h-12 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-60";
    const quiet = "w-full h-12 rounded-md border border-border bg-surface text-base font-semibold hover:bg-surface-sunk";

    if (currentSharedId === inviteId) {
        return (
            <div className="p-4">
                <p className="text-base">Ya estás en esta lista compartida.</p>
                <button type="button" onClick={onCancel} className={`mt-4 ${primary}`}>Vale</button>
            </div>
        );
    }
    return (
        <div className="p-4">
            <p className="text-base">Te han invitado a una lista de la compra compartida: lo que uno apunte o tache, lo veréis todos.</p>
            {currentSharedId ? (
                <p className="mt-2 text-base">Ya estás en otra lista compartida. Si te cambias, en este móvil dejarás de ver la otra.</p>
            ) : localCount > 0 ? (
                <p className="mt-2 text-base">Ahora tienes {localCount} {localCount === 1 ? "producto" : "productos"} en tu lista.</p>
            ) : null}
            <NameField value={name} onChange={text => {
                setName(text);
                if (nameError && hasName(text)) setNameError("");
            }} error={nameError} inputRef={nameRef} />
            <div className="mt-4 space-y-2">
                {currentSharedId ? (
                    <button type="button" disabled={busy} onClick={() => run("replace")} className={primary}>
                        {busy ? "Uniéndote…" : "Cambiarme a esta lista"}
                    </button>
                ) : localCount > 0 ? (
                    <>
                        <button type="button" disabled={busy} onClick={() => run("merge")} className={primary}>
                            {busy ? "Uniéndote…" : "Unirme y añadir mis productos"}
                        </button>
                        <button type="button" disabled={busy} onClick={() => run("replace")} className={secondary}>
                            Unirme sin mis productos
                        </button>
                    </>
                ) : (
                    <button type="button" disabled={busy} onClick={() => run("replace")} className={primary}>
                        {busy ? "Uniéndote…" : "Unirme a la lista"}
                    </button>
                )}
                <button type="button" onClick={onCancel} className={quiet}>Ahora no</button>
            </div>
            {error && <p role="alert" className="mt-3 text-base font-semibold text-danger">{error}</p>}
        </div>
    );
};

// Ya estás en una lista compartida pero sin nombre (te uniste antes de que se pidiera): hay que ponerlo.
// Si no quieres, la otra salida es dejar de compartir en este móvil.
export const NameRequiredPanel = ({ onName, onLeave }: { onName: (text: string) => void, onLeave: () => void }) => {
    const [name, setName] = useState<string>("");
    const [nameError, setNameError] = useState<string>("");
    const [confirmLeave, setConfirmLeave] = useState<boolean>(false);
    const nameRef = useRef<HTMLInputElement>(null);
    // El foco al campo, después de que la ventana se haya colocado (ella se lleva el foco al abrirse)
    useEffect(() => {
        const frame = window.requestAnimationFrame(() => nameRef.current?.focus());
        return () => window.cancelAnimationFrame(frame);
    }, []);
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (!hasName(name)) {
            setNameError(NAME_MISSING);
            nameRef.current?.focus();
            return;
        }
        onName(name);
    };
    return (
        <form onSubmit={save} noValidate className="p-4">
            <p className="text-base">Ahora la lista compartida enseña quién apunta cada cosa. Para seguir en ella, pon tu nombre.</p>
            <NameField value={name} onChange={text => {
                setName(text);
                if (nameError && hasName(text)) setNameError("");
            }} error={nameError} inputRef={nameRef} />
            <button type="submit" className="mt-4 w-full h-12 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong">
                Guardar y seguir
            </button>
            <div className="mt-6 border-t border-border pt-4">
                {confirmLeave ? (
                    <div className="rounded-md bg-surface-sunk p-3">
                        <p className="text-base">Tu lista se queda en este móvil tal como está, y los demás siguen con la suya.</p>
                        <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                            <button type="button" onClick={onLeave} className="h-12 flex-1 rounded-md bg-danger px-4 text-base font-semibold text-on-danger">
                                Sí, dejar de compartir
                            </button>
                            <button type="button" onClick={() => setConfirmLeave(false)} className="h-12 flex-1 rounded-md border border-border bg-surface px-4 text-base font-semibold">
                                Cancelar
                            </button>
                        </div>
                    </div>
                ) : (
                    <button
                        type="button"
                        onClick={() => setConfirmLeave(true)}
                        className="h-11 px-2 inline-flex items-center gap-2 rounded-md text-base font-semibold text-danger hover:bg-surface-sunk"
                    >
                        <LogOut size={20} aria-hidden="true" />
                        Prefiero dejar de compartir
                    </button>
                )}
            </div>
        </form>
    );
};
