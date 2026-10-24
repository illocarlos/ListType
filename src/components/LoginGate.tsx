import { UserRound } from "lucide-react";

// Pantallas a pantalla completa de la cuenta de Google:
// - LoginGate: la entrada es obligatoria (la activa el dueño) y esta persona aún no ha entrado.
// - LoginReturned: Google devolvió a ESTA ventana (en un iPhone, la ventana de Safari que abre la app instalada);
//   la sesión la recoge la app desde la que se empezó, así que aquí solo se avisa.

const primary = "w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong disabled:opacity-60";
const quiet = "w-full h-12 rounded-md border border-border bg-surface text-base font-semibold hover:bg-surface-sunk disabled:opacity-60";

type GateProps = {
    busy: boolean,
    waiting: boolean,
    error: string,
    hasInvite: boolean,
    onSignIn: () => void,
    onCancel: () => void,
};

export const LoginGate = ({ busy, waiting, error, hasInvite, onSignIn, onCancel }: GateProps) => (
    <main className="min-h-screen grid place-items-center bg-bg px-4 py-10 safe-top safe-bottom">
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold">MercaLista</h1>
            <p className="mt-3 text-base">
                Para usar la app entra con tu cuenta de Google. Solo hace falta la primera vez en cada móvil.
            </p>
            {hasInvite && <p className="mt-3 rounded-md bg-surface-sunk p-3 text-base">Has abierto un enlace compartido: al entrar se abre directamente.</p>}
            <ul className="mt-3 space-y-1.5 text-sm text-muted list-disc pl-5">
                <li>Tus listas y favoritos se guardan en tu cuenta y los tienes en todos tus móviles.</li>
                <li>No se guarda tu correo ni tu nombre de Google, solo un identificador.</li>
                <li>Si ya tenías cosas en este móvil, se conservan.</li>
            </ul>
            <button type="button" onClick={onSignIn} disabled={busy || waiting} className={`mt-5 ${primary}`}>
                <UserRound size={20} aria-hidden="true" />
                {busy ? "Entrando…" : "Entrar con Google"}
            </button>
            {waiting && (
                <div role="status" className="mt-3 rounded-md bg-surface-sunk p-3 text-base">
                    <p className="font-semibold">Esperando a que termines de entrar en Google…</p>
                    <p className="mt-1 text-sm text-muted">Cuando acabes, vuelve a esta app: se completa sola en unos segundos.</p>
                    <button type="button" onClick={onCancel} className={`mt-3 ${quiet}`}>Cancelar</button>
                </div>
            )}
            {error && <p role="alert" className="mt-3 text-base font-semibold text-danger">{error}</p>}
            <p className="mt-4 text-sm text-muted">
                En un iPhone con la app en la pantalla de inicio, Google se abre en una ventana de Safari. Al terminar, vuelve a la app
                (cierra esa ventana con «OK» o cambia a MercaLista).
            </p>
        </div>
    </main>
);

export const LoginReturned = () => (
    <main className="min-h-screen grid place-items-center bg-bg px-4 py-10 safe-top safe-bottom">
        <div className="w-full max-w-sm">
            <h1 className="text-2xl font-bold">Ya has entrado con Google</h1>
            <p role="status" className="mt-3 text-base">
                Vuelve a la app MercaLista: cierra esta ventana con «OK» o cambia a ella. La entrada se completa sola en unos segundos.
            </p>
            <a href="/" className={`mt-5 ${quiet} grid place-items-center`}>Usar MercaLista aquí, en el navegador</a>
        </div>
    </main>
);
