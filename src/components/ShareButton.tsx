import { MessageCircle } from "lucide-react";
import { formatCurrency } from "../helpers/formatPrice";
import type { orderItem } from "../types/types";

type ShareButtonProps = { order: orderItem[] };

// Texto de la lista listo para mandar por WhatsApp
function listAsText(order: orderItem[]): string {
    const lines = order.map(item => {
        const price = item.price > 0 ? ` (${formatCurrency(item.price * item.quantity)})` : "";
        const amount = item.byWeight ? `${item.quantity} kg aprox.` : `${item.quantity} ×`;
        return `☐ ${amount} ${item.name}${price}`;
    });
    const total = order.reduce((sum, item) => sum + item.price * item.quantity, 0);
    return [
        "🛒 Lista de la compra",
        "",
        ...lines,
        "",
        `Total aproximado: ${formatCurrency(total)}`,
    ].join("\n");
}

// Abre WhatsApp con la lista escrita; la persona elige a quién mandársela
const ShareButton = ({ order }: ShareButtonProps) => {
    const share = () => {
        const url = `https://wa.me/?text=${encodeURIComponent(listAsText(order))}`;
        window.open(url, "_blank", "noopener,noreferrer");
    };

    return (
        <button
            type="button"
            onClick={share}
            disabled={order.length === 0}
            className="w-full h-12 inline-flex items-center justify-center gap-2 rounded-md border-2 border-accent bg-surface text-accent-strong text-base font-semibold hover:bg-accent-soft disabled:opacity-50"
        >
            <MessageCircle size={20} aria-hidden="true" />
            Enviar por WhatsApp
        </button>
    );
};

export default ShareButton;
