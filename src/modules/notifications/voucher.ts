import QRCode from "qrcode";

import type { Locale } from "@/i18n/config";
import { absoluteUrl } from "@/site";

/**
 * Comprobante QR de la reserva · S7-6
 *
 * El QR no lleva datos del huésped adentro — solo apunta a `/reserva/[code]`,
 * la misma página que ya existe desde el Sprint 3. Es la decisión que evita
 * dos problemas a la vez: un QR con nombre, correo o monto es un dato personal
 * que viaja fuera de la base sin control de acceso, y si algo cambia después
 * de mandar el correo (un cambio de fecha, una cancelación) un QR con los
 * datos adentro quedaría mostrando algo que ya no es cierto. La página sí
 * refleja el estado real en el momento en que se escanea.
 */
export function voucherUrl(code: string, locale: Locale): string {
  return absoluteUrl(`/${locale}/reserva/${code}`);
}

/** PNG del comprobante, listo para adjuntar al correo de confirmación. */
export async function bookingVoucherQr(code: string, locale: Locale): Promise<Buffer> {
  return QRCode.toBuffer(voucherUrl(code, locale), {
    type: "png",
    errorCorrectionLevel: "M",
    margin: 2,
    width: 320,
  });
}
