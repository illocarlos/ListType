import { useState } from 'react';
import { FileDown, Share } from 'lucide-react';
import type { orderItem } from "../types/types"
import { formatCurrency } from '../helpers/formatPrice';
import { imageToDataUrl } from '../helpers/mercadona';
import { isIOS } from '../helpers/install';

const FILE_NAME = 'pedido.pdf';

// En iPhone y iPad las descargas fallan en la app instalada en la pantalla de inicio
// (WebKit 275288 y 290847: no hacen nada o abren una vista sin botón para volver).
// Allí el PDF se entrega con el menú de compartir del sistema: Guardar en Archivos, Imprimir, WhatsApp…
function canShareFile(file: File): boolean {
    try {
        return isIOS() && typeof navigator.share === 'function' && navigator.canShare?.({ files: [file] }) === true;
    } catch {
        return false;
    }
}

type ShareResult = 'shared' | 'cancelled' | 'needs-tap';

async function shareFile(file: File): Promise<ShareResult> {
    try {
        await navigator.share({ files: [file] });
        return 'shared';
    } catch (error) {
        const name = (error as { name?: string })?.name;
        // La persona cerró el menú: no es un error
        if (name === 'AbortError') return 'cancelled';
        // Safari solo deja compartir justo después de un toque; si preparar el PDF tardó, pide otro toque
        if (name === 'NotAllowedError') return 'needs-tap';
        throw error;
    }
}

type ButtonPdfProps = {
    order: orderItem[]
}

// Medidas en milímetros (A4: 210 x 297). "Modo tienda": cuadrícula de 3 tarjetas por fila con la foto
// grande y una casilla por producto para tacharlo a boli al meterlo en el carro.
// A petición del dueño, fotos más grandes: 42 mm (antes 28 en lista) y caben 9 productos por hoja (antes 6).
const MARGIN = 18;
const TOP = 20;
const CHECKBOX = 6;
const COLUMNS = 3;
const GAP = 5;
const PAD = 3;
const PHOTO = 42;
// Se pide a 400 px para que la foto se vea nítida impresa (unos 240 ppp a 42 mm)
const IMAGE_PX = 400;
const NAME_SIZE = 11;
const NAME_LINE = 4.6;
const NAME_LINES = 3;
const DETAIL_SIZE = 8.5;
const TOTAL_SIZE = 14;
// Verde de la app (accent-strong) para la raya del total
const ACCENT: [number, number, number] = [31, 79, 49];

const DownloadPdfButton = ({ order }: ButtonPdfProps) => {
    const [generating, setGenerating] = useState(false);
    // PDF ya preparado que espera un segundo toque para abrir el menú de compartir (solo iPhone/iPad)
    const [readyFile, setReadyFile] = useState<File | null>(null);

    const shareReady = async () => {
        if (!readyFile) return;
        try {
            const result = await shareFile(readyFile);
            if (result !== 'needs-tap') setReadyFile(null);
        } catch {
            setReadyFile(null);
            alert('No se ha podido abrir el PDF. Inténtalo otra vez.');
        }
    };

    const handleDownloadPdf = async () => {
        if (!order || order.length === 0) {
            alert('No hay elementos para generar el PDF');
            return;
        }

        setReadyFile(null);
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
                order.map(item => item.image ? imageToDataUrl(item.image, IMAGE_PX) : Promise.resolve(null))
            );

            // Título
            doc.setFontSize(16);
            doc.text('Lista de Pedidos churriiiiiii', MARGIN, TOP);
            doc.setFontSize(11);
            doc.text(new Date().toLocaleDateString('es-ES'), pageWidth - MARGIN, TOP, { align: 'right' });
            doc.setTextColor(90);
            doc.text('Marca cada casilla al meterlo en el carro.', MARGIN, TOP + 7);
            doc.setTextColor(0);

            // Tarjetas: foto, nombre (hasta 3 líneas), formato y precio por kilo, y abajo casilla, cantidad y precio
            const cardWidth = (pageWidth - MARGIN * 2 - GAP * (COLUMNS - 1)) / COLUMNS;
            const cardHeight = PAD + PHOTO + 3 + NAME_LINES * NAME_LINE + 4 + CHECKBOX + PAD;
            // 3 filas por hoja; en la primera, debajo del título (y el total cabe en la misma hoja)
            let rowTop = 32;

            order.forEach((item, index) => {
                const column = index % COLUMNS;
                if (column === 0 && index > 0) rowTop += cardHeight + GAP;
                // Salto de página si la fila no cabe
                if (column === 0 && rowTop + cardHeight > bottom) {
                    doc.addPage();
                    rowTop = TOP;
                }
                const x = MARGIN + column * (cardWidth + GAP);
                const inner = cardWidth - PAD * 2;

                doc.setDrawColor(200);
                doc.setLineWidth(0.3);
                doc.roundedRect(x, rowTop, cardWidth, cardHeight, 2, 2);

                // Foto (o la inicial en gris si es un producto apuntado a mano o la foto no se pudo traer)
                const photoX = x + (cardWidth - PHOTO) / 2;
                const photoY = rowTop + PAD;
                const image = images[index];
                if (image) {
                    doc.addImage(image, 'JPEG', photoX, photoY, PHOTO, PHOTO);
                } else {
                    doc.setFillColor(236, 240, 233);
                    doc.rect(photoX, photoY, PHOTO, PHOTO, 'F');
                    doc.setFontSize(28);
                    doc.setTextColor(120);
                    doc.text(item.name.trim().charAt(0).toUpperCase() || '·', photoX + PHOTO / 2, photoY + PHOTO / 2 + 4, { align: 'center' });
                    doc.setTextColor(0);
                }

                // Nombre: hasta 3 líneas; si es más largo, la última acaba en "…"
                doc.setFont('helvetica', 'normal');
                doc.setFontSize(NAME_SIZE);
                let lines: string[] = doc.splitTextToSize(`${index + 1}. ${item.name}`, inner);
                if (lines.length > NAME_LINES) {
                    lines = lines.slice(0, NAME_LINES);
                    let last = lines[NAME_LINES - 1];
                    while (last.length > 1 && doc.getTextWidth(`${last}…`) > inner) last = last.slice(0, -1);
                    lines[NAME_LINES - 1] = `${last.trimEnd()}…`;
                }
                const nameY = photoY + PHOTO + 5;
                doc.text(lines, x + PAD, nameY);

                // Formato y precio por kilo/litro, en gris y en una línea
                const detail = [item.store, item.packaging, item.unitPrice].filter(Boolean).join(' · ');
                if (detail) {
                    doc.setFontSize(DETAIL_SIZE);
                    doc.setTextColor(90);
                    doc.text(doc.splitTextToSize(detail, inner)[0], x + PAD, nameY + NAME_LINES * NAME_LINE);
                    doc.setTextColor(0);
                }

                // Casilla, cantidad y precio
                const lineY = rowTop + cardHeight - PAD - CHECKBOX;
                doc.setDrawColor(40);
                doc.setLineWidth(0.5);
                doc.rect(x + PAD, lineY, CHECKBOX, CHECKBOX);
                doc.setFont('helvetica', 'bold');
                doc.setFontSize(NAME_SIZE);
                doc.text(item.byWeight ? `${item.quantity} kg aprox.` : `x${item.quantity}`, x + PAD + CHECKBOX + 2, lineY + CHECKBOX - 1.5);
                if (item.price > 0) {
                    doc.text(formatCurrency(item.price * item.quantity), x + cardWidth - PAD, lineY + CHECKBOX - 1.5, { align: 'right' });
                }
                doc.setFont('helvetica', 'normal');
            });

            // Total: debajo de la última fila; solo pasa a otra hoja si de verdad no cabe (margen inferior de 10 mm)
            const total = order.reduce((sum, item) => sum + item.price * item.quantity, 0);
            let lineY = rowTop + cardHeight + 4;
            if (lineY + 7 > pageHeight - 10) {
                doc.addPage();
                lineY = TOP;
            }
            doc.setDrawColor(...ACCENT);
            doc.setLineWidth(0.4);
            doc.line(MARGIN, lineY, pageWidth - MARGIN, lineY);
            doc.setFontSize(TOTAL_SIZE);
            doc.text(`Total aprox: ${formatCurrency(total)}`, pageWidth - MARGIN, lineY + 7, { align: 'right' });

            const file = new File([doc.output('blob')], FILE_NAME, { type: 'application/pdf' });
            if (canShareFile(file)) {
                if (await shareFile(file) === 'needs-tap') setReadyFile(file);
            } else {
                doc.save(FILE_NAME);
            }
        } catch {
            alert('No se ha podido generar el PDF. Inténtalo otra vez.');
        } finally {
            setGenerating(false);
        }
    };

    return (
        <>
            <button
                type='button'
                className='w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent text-on-accent font-semibold hover:bg-accent-strong disabled:opacity-50 disabled:hover:bg-accent'
                onClick={handleDownloadPdf}
                disabled={!order || order.length === 0 || generating}
            >
                <FileDown size={20} aria-hidden='true' />
                {generating ? 'Generando PDF…' : 'Descargar lista PDF'}
            </button>

            {/* Aviso que se anuncia al aparecer: el PDF está listo y hace falta un toque más */}
            <div role='status' aria-live='polite'>
                {readyFile && (
                    <div className='rounded-md bg-highlight p-3 text-on-highlight'>
                        <p className='text-base font-semibold'>El PDF está listo.</p>
                        <button
                            type='button'
                            onClick={shareReady}
                            className='mt-2 w-full h-12 inline-flex items-center justify-center gap-2 rounded-md bg-accent-strong text-on-accent font-semibold'
                        >
                            <Share size={20} aria-hidden='true' />
                            Guardar o enviar el PDF
                        </button>
                    </div>
                )}
            </div>
        </>
    );
};

export default DownloadPdfButton;
