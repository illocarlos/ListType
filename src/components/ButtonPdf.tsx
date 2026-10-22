import { useState } from 'react';
import { FileDown } from 'lucide-react';
import type { orderItem } from "../types/types"
import { formatCurrency } from '../helpers/formatPrice';
import { imageToDataUrl } from '../helpers/mercadona';

type ButtonPdfProps = {
    order: orderItem[]
}

// Medidas en milímetros (A4: 210 x 297). "Modo tienda": letra grande y una casilla
// por producto para tacharlo a boli al meterlo en el carro.
const MARGIN = 18;
const TOP = 20;
const CHECKBOX = 7;
const IMAGE_SIZE = 14;
const LINE_HEIGHT = 7;
const NAME_SIZE = 14;
const DETAIL_SIZE = 11;

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
            doc.setFontSize(11);
            doc.text(new Date().toLocaleDateString('es-ES'), pageWidth - MARGIN, TOP, { align: 'right' });
            doc.setTextColor(90);
            doc.text('Marca cada casilla al meterlo en el carro.', MARGIN, TOP + 7);
            doc.setTextColor(0);

            // Datos
            let yPosition = 42;

            order.forEach((item, index) => {
                const image = images[index];
                const imageX = MARGIN + CHECKBOX + 4;
                const textX = image ? imageX + IMAGE_SIZE + 4 : imageX;
                const priceWidth = 30;

                doc.setFontSize(NAME_SIZE);
                const nameLines: string[] = doc.splitTextToSize(
                    `${index + 1}. ${item.name} - Cantidad: ${item.quantity}`,
                    pageWidth - textX - MARGIN - priceWidth
                );
                const detail = [item.packaging, item.unitPrice].filter(Boolean).join(' · ');
                const textHeight = nameLines.length * LINE_HEIGHT + (detail ? 6 : 0);
                const rowHeight = Math.max(image ? IMAGE_SIZE + 2 : CHECKBOX + 2, textHeight) + 5;

                // Salto de página si la línea no cabe
                if (yPosition + rowHeight > bottom) {
                    doc.addPage();
                    yPosition = TOP;
                }

                // Casilla para tachar
                doc.setDrawColor(40);
                doc.setLineWidth(0.5);
                doc.rect(MARGIN, yPosition - 5.5, CHECKBOX, CHECKBOX);

                if (image) {
                    doc.addImage(image, 'JPEG', imageX, yPosition - 6, IMAGE_SIZE, IMAGE_SIZE);
                }

                doc.setFontSize(NAME_SIZE);
                doc.text(nameLines, textX, yPosition);

                if (item.price > 0) {
                    doc.text(formatCurrency(item.price * item.quantity), pageWidth - MARGIN, yPosition, { align: 'right' });
                }

                if (detail) {
                    doc.setFontSize(DETAIL_SIZE);
                    doc.setTextColor(90);
                    doc.text(detail, textX, yPosition + (nameLines.length - 1) * LINE_HEIGHT + 6);
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
            doc.setLineWidth(0.3);
            doc.line(MARGIN, yPosition - 2, pageWidth - MARGIN, yPosition - 2);
            doc.setFontSize(NAME_SIZE);
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
            type='button'
            className='w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:hover:bg-accent'
            onClick={handleDownloadPdf}
            disabled={!order || order.length === 0 || generating}
        >
            <FileDown size={20} aria-hidden='true' />
            {generating ? 'Generando PDF…' : 'Descargar lista PDF'}
        </button>
    );
};

export default DownloadPdfButton;
