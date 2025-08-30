import jsPDF from 'jspdf';
import type { orderItem } from "../types/types"

type ButtonPdfProps = {
    order: orderItem[]
}

const DownloadPdfButton = ({ order }: ButtonPdfProps) => {
    const handleDownloadPdf = () => {
        if (!order || order.length === 0) {
            alert('No hay elementos para generar el PDF');
            return;
        }

        const doc = new jsPDF();

        // Título
        doc.setFontSize(16);
        doc.text('Lista de Pedidos churriiiiiii', 20, 20);

        // Datos
        doc.setFontSize(12);
        let yPosition = 40;

        order.forEach((item, index) => {
            const text = `${index + 1}. ${item.name} - Cantidad: ${item.quantity}`;
            doc.text(text, 20, yPosition);
            yPosition += 10;
        });

        doc.save('pedido.pdf');
    };

    return (
        <button
            className='bg-emerald-200 p-3 font-extrabold'
            onClick={handleDownloadPdf}
            disabled={!order || order.length === 0}
        >
            Descargar lista PDF
        </button>
    );
};

export default DownloadPdfButton;