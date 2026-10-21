import { useState } from 'react';
import type { orderItem } from "../types/types"
import { formatCurrency } from '../helpers/formatPrice';
import { imageToDataUrl } from '../helpers/mercadona';

type ButtonPdfProps = {
    order: orderItem[]
}

// Medidas en milímetros (A4: 210 x 297)
const MARGIN = 20;
const TOP = 20;
const IMAGE_SIZE = 12;
const LINE_HEIGHT = 6;

const DownloadPdfButton = ({ order }: ButtonPdfProps) => {
    const [generating, setGenerating] = useState(false);

    const handleDownloadPdf = async () => {
        if (!order || order.length === 0) {
            alert('No hay elementos para generar el PDF');
            return;
        }

        setGenerating(true);
        try {
            // jsPDF se carga solo al pulsar el botón: la app abre más rápido
            const { jsPDF } = await import('jspdf');
            const doc = new jsPDF();
            const pageWidth = doc.internal.pageSize.getWidth();
            const pageHeight = doc.internal.pageSize.getHeight();
            const bottom = pageHeight - MARGIN;

            // Miniaturas de los productos de Mercadona; si alguna falla, esa línea sale sin foto
            const images = await Promise.all(
                order.map(item => item.image ? imageToDataUrl(item.image) : Promise.resolve(null))
            );

            // Título
            doc.setFontSize(16);
            doc.text('Lista de Pedidos churriiiiiii', MARGIN, TOP);
            doc.setFontSize(9);
            doc.text(new Date().toLocaleDateString('es-ES'), pageWidth - MARGIN, TOP, { align: 'right' });

            // Datos
            let yPosition = 40;

            order.forEach((item, index) => {
                const image = images[index];
                const textX = image ? MARGIN + IMAGE_SIZE + 4 : MARGIN;
                const priceWidth = 28;

                doc.setFontSize(12);
                const nameLines: string[] = doc.splitTextToSize(
                    `${index + 1}. ${item.name} - Cantidad: ${item.quantity}`,
                    pageWidth - textX - MARGIN - priceWidth
                );
                const detail = [item.packaging, item.unitPrice].filter(Boolean).join(' · ');
                const textHeight = nameLines.length * LINE_HEIGHT + (detail ? 5 : 0);
                const rowHeight = Math.max(image ? IMAGE_SIZE + 2 : 0, textHeight) + 4;

                // Salto de página si la línea no cabe
                if (yPosition + rowHeight > bottom) {
                    doc.addPage();
                    yPosition = TOP;
                }

                if (image) {
                    doc.addImage(image, 'JPEG', MARGIN, yPosition - 5, IMAGE_SIZE, IMAGE_SIZE);
                }

                doc.setFontSize(12);
                doc.text(nameLines, textX, yPosition);

                if (item.price > 0) {
                    doc.text(formatCurrency(item.price * item.quantity), pageWidth - MARGIN, yPosition, { align: 'right' });
                }

                if (detail) {
                    doc.setFontSize(9);
                    doc.setTextColor(110);
                    doc.text(detail, textX, yPosition + (nameLines.length - 1) * LINE_HEIGHT + 5);
                    doc.setTextColor(0);
                }

                yPosition += rowHeight;
            });

            // Total
            const total = order.reduce((sum, item) => sum + item.price * item.quantity, 0);
            if (yPosition + 10 > bottom) {
                doc.addPage();
                yPosition = TOP;
            }
            doc.setDrawColor(16, 185, 129);
            doc.line(MARGIN, yPosition - 2, pageWidth - MARGIN, yPosition - 2);
            doc.setFontSize(12);
            doc.text(`Total aprox: ${formatCurrency(total)}`, pageWidth - MARGIN, yPosition + 5, { align: 'right' });

            doc.save('pedido.pdf');
        } catch {
            alert('No se ha podido generar el PDF. Inténtalo otra vez.');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <button
            className='bg-emerald-200 p-3 font-extrabold disabled:opacity-50'
            onClick={handleDownloadPdf}
            disabled={!order || order.length === 0 || generating}
        >
            {generating ? 'Generando PDF…' : 'Descargar lista PDF'}
        </button>
    );
};

export default DownloadPdfButton;
