import { useId, useState } from "react";
import { ChevronRight, Heart, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import type { FavSummary } from "../helpers/favlists";

type MyFavoritesProps = {
    collections: FavSummary[],
    currentId: string,
    pinnedId: string | null,
    canAdd: boolean,
    onOpen: (id: string) => void,
    onPin: (id: string | null) => void,
    onNew: (name: string) => void,
    onRename: (id: string, name: string) => void,
    onDelete: (id: string) => void,
};

// Una fila de la lista de colecciones: nombre, nº de productos y los primeros nombres.
// La chincheta la fija (se abre directamente al tocar «Favoritos»); el lápiz abre renombrar/borrar.
const CollectionCard = ({ collection, current, pinned, canDelete, onOpen, onPin, onRename, onDelete }: {
    collection: FavSummary,
    current: boolean,
    pinned: boolean,
    canDelete: boolean,
    onOpen: () => void,
    onPin: () => void,
    onRename: (name: string) => void,
    onDelete: () => void,
}) => {
    const [editing, setEditing] = useState<boolean>(false);
    const [name, setName] = useState<string>(collection.name);
    const [confirmDelete, setConfirmDelete] = useState<boolean>(false);
    const nameId = useId();
    const save = (event: React.FormEvent) => {
        event.preventDefault();
        if (name.trim()) onRename(name);
        setEditing(false);
    };
    return (
        <li aria-current={current ? "true" : undefined} className={`rounded-md border-2 bg-surface ${current ? "border-accent" : "border-border"}`}>
            <div className="flex items-stretch">
                <button
                    type="button"
                    onClick={onOpen}
                    className="flex min-w-0 flex-1 items-center gap-3 p-4 text-left rounded-l-md hover:bg-surface-sunk"
                >
                    <Heart size={24} aria-hidden="true" className="flex-none text-danger" />
                    <span className="min-w-0 flex-1">
                        <span className="block font-bold text-base break-words">{collection.name}</span>
                        {(current || pinned) && (
                            <span className="mt-1 flex flex-wrap gap-1">
                                {current && <span className="whitespace-nowrap rounded-pill bg-accent-soft px-2 text-sm font-semibold text-on-accent-soft">abierta</span>}
                                {pinned && <span className="whitespace-nowrap rounded-pill bg-highlight px-2 text-sm font-semibold text-on-highlight">fijada</span>}
                            </span>
                        )}
                        <span className="mt-0.5 block text-sm text-muted tabular">
                            {collection.count === 0 ? "Vacía" : `${collection.count} ${collection.count === 1 ? "producto" : "productos"}`}
                        </span>
                        {collection.preview && <span className="block truncate text-sm text-muted">{collection.preview}</span>}
                    </span>
                    <ChevronRight size={20} aria-hidden="true" className="flex-none text-muted" />
                </button>
                <button
                    type="button"
                    onClick={onPin}
                    aria-pressed={pinned}
                    aria-label={pinned ? `Dejar de fijar ${collection.name}` : `Fijar ${collection.name}`}
                    className={`flex-none w-12 grid place-items-center border-l border-border hover:bg-surface-sunk ${pinned ? "text-accent-strong bg-accent-soft" : "text-muted hover:text-text"}`}
                >
                    <Pin size={18} aria-hidden="true" className={pinned ? "fill-current" : ""} />
                </button>
                <button
                    type="button"
                    onClick={() => {
                        setEditing(open => !open);
                        setConfirmDelete(false);
                        setName(collection.name);
                    }}
                    aria-expanded={editing}
                    aria-label={`Opciones de ${collection.name}`}
                    className="flex-none w-12 grid place-items-center border-l border-border text-muted hover:bg-surface-sunk hover:text-text rounded-r-md"
                >
                    <Pencil size={18} aria-hidden="true" />
                </button>
            </div>
            {editing && (
                <div className="border-t border-border p-3">
                    <form onSubmit={save} className="flex gap-2">
                        <label htmlFor={nameId} className="sr-only">Nombre de la colección</label>
                        <input
                            id={nameId}
                            type="text"
                            value={name}
                            onChange={event => setName(event.target.value)}
                            maxLength={40}
                            autoComplete="off"
                            className="h-11 min-w-0 flex-1 rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                        />
                        <button type="submit" className="h-11 flex-none rounded-md bg-accent-soft px-4 text-base font-semibold text-on-accent-soft">Guardar</button>
                    </form>
                    {canDelete && (confirmDelete ? (
                        <div className="mt-2 rounded-md bg-surface-sunk p-2">
                            <p className="text-sm">Se borra de este móvil, con sus {collection.count} {collection.count === 1 ? "producto" : "productos"}.</p>
                            <div className="mt-2 flex gap-2">
                                <button type="button" onClick={onDelete} className="h-11 flex-1 rounded-md bg-danger px-3 text-base font-semibold text-on-danger">Borrar colección</button>
                                <button type="button" onClick={() => setConfirmDelete(false)} className="h-11 flex-1 rounded-md border border-border bg-surface px-3 text-base font-semibold">Cancelar</button>
                            </div>
                        </div>
                    ) : (
                        <button
                            type="button"
                            onClick={() => setConfirmDelete(true)}
                            className="mt-2 h-11 px-1 inline-flex items-center gap-2 text-base font-semibold text-danger"
                        >
                            <Trash2 size={18} aria-hidden="true" />
                            Borrar esta colección
                        </button>
                    ))}
                </div>
            )}
        </li>
    );
};

const MyFavorites = ({ collections, currentId, pinnedId, canAdd, onOpen, onPin, onNew, onRename, onDelete }: MyFavoritesProps) => {
    const [adding, setAdding] = useState<boolean>(false);
    const [name, setName] = useState<string>("");
    const newId = useId();
    const create = (event: React.FormEvent) => {
        event.preventDefault();
        if (!name.trim()) return;
        onNew(name);
        setName("");
        setAdding(false);
    };
    return (
        <div>
            <p className="mb-3 text-sm text-muted">Toca una colección para abrirla. La que fijes con la chincheta se abre directamente al tocar «Favoritos». El corazón guarda en la que tengas abierta.</p>
            <ul className="space-y-3">
                {collections.map(collection => (
                    <CollectionCard
                        key={collection.id}
                        collection={collection}
                        current={collection.id === currentId}
                        pinned={collection.id === pinnedId}
                        onOpen={() => onOpen(collection.id)}
                        onPin={() => onPin(collection.id === pinnedId ? null : collection.id)}
                        onRename={newName => onRename(collection.id, newName)}
                        onDelete={() => onDelete(collection.id)}
                        canDelete={collections.length > 1 || collection.count > 0}
                    />
                ))}
            </ul>

            {adding ? (
                <form onSubmit={create} className="mt-3 rounded-md border-2 border-accent bg-surface p-3">
                    <label htmlFor={newId} className="block text-base font-semibold">Nombre de la colección nueva</label>
                    <input
                        id={newId}
                        type="text"
                        value={name}
                        onChange={event => setName(event.target.value)}
                        maxLength={40}
                        autoComplete="off"
                        autoFocus
                        placeholder="Por ejemplo: Cosas de Lidl"
                        className="mt-1 h-12 w-full rounded-md border-2 border-border-input bg-surface px-3 text-base focus:border-accent focus:outline-none"
                    />
                    <div className="mt-2 flex gap-2">
                        <button type="submit" className="h-12 flex-1 rounded-md bg-accent text-on-accent text-base font-semibold hover:bg-accent-strong">Crear y abrir</button>
                        <button type="button" onClick={() => { setAdding(false); setName(""); }} className="h-12 flex-1 rounded-md border border-border bg-surface text-base font-semibold">Cancelar</button>
                    </div>
                </form>
            ) : (
                <button
                    type="button"
                    onClick={() => setAdding(true)}
                    disabled={!canAdd}
                    className="mt-3 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-50"
                >
                    <Plus size={20} aria-hidden="true" />
                    Nueva colección
                </button>
            )}
            {!canAdd && <p className="mt-2 text-sm text-muted">Has llegado al máximo de colecciones. Borra alguna para crear otra.</p>}
        </div>
    );
};

export default MyFavorites;
