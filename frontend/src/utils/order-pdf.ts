import { Platform } from "react-native";
import * as Print from "expo-print";
import * as Sharing from "expo-sharing";

export type OrderLine = {
  name: string;
  supplier_code?: string | null;
  internal_code?: string | null;
  barcode?: string | null;
  unit: string;
  qty: number;
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

// Suggested reorder quantity: bring the total up to twice the minimum threshold.
export const suggestedQty = (total: number, min: number) => Math.max(1, min * 2 - total);

function buildHtml(stockName: string, supplier: string, lines: OrderLine[]) {
  const date = new Date().toLocaleDateString("it-IT");
  const rows = lines
    .map(
      (l, i) => `<tr>
        <td>${i + 1}</td>
        <td class="code-col"><b>${esc(l.supplier_code || "—")}</b></td>
        <td>${esc(l.name)}${l.barcode ? `<div class="sub">EAN ${esc(l.barcode)}</div>` : ""}</td>
        <td class="code-col">${esc(l.internal_code || "—")}</td>
        <td class="num qty">${l.qty}</td>
        <td>${esc(l.unit)}</td>
      </tr>`,
    )
    .join("");
  const totalPieces = lines.reduce((s, l) => s + l.qty, 0);
  return `<!DOCTYPE html><html><head><meta charset="utf-8"/>
  <style>
    body { font-family: -apple-system, Helvetica, Arial, sans-serif; color: #1A1A1A; padding: 32px; }
    h1 { font-size: 24px; margin: 0; color: #FF6B6B; }
    .meta { margin: 16px 0 24px; font-size: 13px; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; }
    th { text-align: left; background: #F2EFE9; padding: 8px; border-bottom: 2px solid #E5E2DB; }
    td { padding: 8px; border-bottom: 1px solid #E5E2DB; vertical-align: top; }
    .num { text-align: right; }
    .qty { font-weight: 800; font-size: 15px; }
    .code-col { white-space: nowrap; }
    .sub { color: #737373; font-size: 11px; margin-top: 2px; }
    .foot { margin-top: 24px; font-size: 13px; }
    .sign { margin-top: 56px; font-size: 12px; color: #737373; }
  </style></head><body>
    <h1>Ordine di acquisto</h1>
    <div class="meta">
      <div><b>Fornitore:</b> ${esc(supplier)}</div>
      <div><b>Cliente:</b> ${esc(stockName)}</div>
      <div><b>Data:</b> ${date}</div>
    </div>
    <table>
      <thead><tr><th>#</th><th>Cod. fornitore</th><th>Descrizione</th><th>Cod. interno</th><th class="num">Quantità</th><th>Unità</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>
    <div class="foot"><b>Righe:</b> ${lines.length} &nbsp;·&nbsp; <b>Pezzi totali:</b> ${totalPieces}</div>
    <div class="sign">Firma ______________________________</div>
  </body></html>`;
}

export async function exportOrderPdf(stockName: string, supplier: string, lines: OrderLine[]) {
  const html = buildHtml(stockName, supplier, lines);
  if (Platform.OS === "web") {
    // Browser print dialog lets the user "Save as PDF".
    await Print.printAsync({ html });
    return;
  }
  const { uri } = await Print.printToFileAsync({ html });
  if (await Sharing.isAvailableAsync()) {
    await Sharing.shareAsync(uri, {
      mimeType: "application/pdf",
      UTI: "com.adobe.pdf",
      dialogTitle: `Ordine ${supplier}`,
    });
  }
}
