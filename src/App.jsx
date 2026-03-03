import { useState, useEffect, useMemo } from "react";
import { supabase } from './lib/supabase.js';

// ─── INITIAL DATA ────────────────────────────────────────────────────────────
const INITIAL_PRODUCTS = [
  { id: 1, nome: "Gasolina",   unidade: "L",  preco: 91.42,  cor: "#f59e0b" },
  { id: 2, nome: "Diesel",     unidade: "L",  preco: 92.42,  cor: "#3b82f6" },
  { id: 3, nome: "Petróleo",   unidade: "L",  preco: 88.00,  cor: "#8b5cf6" },
  { id: 4, nome: "Óleo Motor", unidade: "L",  preco: 450.00, cor: "#10b981" },
  { id: 5, nome: "Outros",     unidade: "un", preco: 0,      cor: "#6b7280" },
];

const INITIAL_PRICE_HISTORY = [
  { id: 1, produtoId: 1, produtoNome: "Gasolina", precoAnterior: 85.00, precoNovo: 91.42, data: "2023-01-01", motivo: "Revisão de mercado" },
  { id: 2, produtoId: 2, produtoNome: "Diesel",   precoAnterior: 87.00, precoNovo: 92.42, data: "2023-01-01", motivo: "Revisão de mercado" },
];

const INITIAL_CLIENTS = [
  { id: 1, nome: "Aeroportos de Moçambique, EP", nif: "400012345", contacto: "21-465000", email: "geral@adm.co.mz", cidade: "Maputo", tipo: "pre-pago" },
  { id: 2, nome: "LAM Linhas Aéreas",            nif: "400023456", contacto: "21-465100", email: "info@lam.co.mz",  cidade: "Maputo", tipo: "pos-pago" },
];

const INITIAL_ORDERS = [
  { id: 1, clienteId: 1, data: "2022-12-26", reqNum: "178", produtoId: 2, qtd: 60,  valorUnit: 92.42, total: 5545.2,  status: "entregue" },
  { id: 2, clienteId: 1, data: "2022-12-26", reqNum: "179", produtoId: 2, qtd: 40,  valorUnit: 92.42, total: 3696.8,  status: "entregue" },
  { id: 3, clienteId: 1, data: "2022-12-28", reqNum: "180", produtoId: 2, qtd: 500, valorUnit: 92.42, total: 46210,   status: "entregue" },
  { id: 4, clienteId: 1, data: "2023-01-06", reqNum: "186", produtoId: 1, qtd: 10,  valorUnit: 91.42, total: 914.2,   status: "entregue" },
  { id: 5, clienteId: 1, data: "2023-01-09", reqNum: "187", produtoId: 2, qtd: 30,  valorUnit: 92.42, total: 2772.6,  status: "entregue" },
  { id: 6, clienteId: 1, data: "2023-01-12", reqNum: "188", produtoId: 2, qtd: 50,  valorUnit: 92.42, total: 4621,    status: "entregue" },
  { id: 7, clienteId: 2, data: "2023-01-15", reqNum: "001", produtoId: 1, qtd: 200, valorUnit: 91.42, total: 18284,   status: "entregue" },
];

const INITIAL_PAYMENTS = [
  { id: 1, clienteId: 1, data: "2022-12-23", valor: 98639.80, referencia: "TRF-2022-001", metodo: "Transferência", notas: "Pagamento Dezembro 2022" },
];
const INITIAL_INVOICES = []; // Faturas mensais emitidas

// ─── HELPERS ─────────────────────────────────────────────────────────────────
const fmt     = (n) => new Intl.NumberFormat("pt-MZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(n || 0);
const fmtDate = (d) => d ? new Date(d + "T00:00:00").toLocaleDateString("pt-MZ") : "—";
const genId   = () => Date.now() + Math.floor(Math.random() * 9999);

const calcSaldo = (clienteId, orders, payments) => {
  const faturado = orders.filter(o => o.clienteId === clienteId && o.status !== "cancelado").reduce((s, o) => s + o.total, 0);
  const pago     = payments.filter(p => p.clienteId === clienteId).reduce((s, p) => s + p.valor, 0);
  return { faturado, pago, saldo: pago - faturado };
};

const calcOrdersPago = (clienteId, orders, payments) => {
  const clientOrders = orders
    .filter(o => o.clienteId === clienteId && o.status !== "cancelado")
    .sort((a, b) => new Date(a.data) - new Date(b.data));
  let restante = payments.filter(p => p.clienteId === clienteId).reduce((s, p) => s + p.valor, 0);
  return clientOrders.map(o => {
    const valorPago   = Math.min(restante, o.total);
    restante         -= valorPago;
    const valorDivida = o.total - valorPago;
    const estadoPag   = valorPago >= o.total ? "pago" : valorPago > 0 ? "parcial" : "divida";
    return { ...o, valorPago, valorDivida, estadoPag };
  });
};

const exportCSV = (rows, cols, filename) => {
  const header = cols.map(c => `"${c.label}"`).join(",");
  const data   = rows.map(r => cols.map(c => `"${(r[c.key] ?? "").toString().replace(/"/g, "'")}"`).join(","));
  const csv    = "\uFEFF" + [header, ...data].join("\n");
  const uri    = "data:text/csv;charset=utf-8," + encodeURIComponent(csv);
  const a      = document.createElement("a");
  a.href       = uri;
  a.download   = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
};

// ─── PDF — FACTURA ────────────────────────────────────────────────────────────
const printInvoice = (order, client, product) => {
  const w = window.open("", "_blank", "width=820,height=640");
  const statusLabel = { entregue:"Entregue", pendente:"Pendente", cancelado:"Cancelado" };
  const statusColor = { entregue:"#059669", pendente:"#d97706", cancelado:"#dc2626" };
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Factura ${order.reqNum || "S/N"}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;padding:48px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:40px;padding-bottom:24px;border-bottom:3px solid #f59e0b}
    .brand-logo{width:48px;height:48px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
    .brand-name{font-size:1.6rem;font-weight:900;letter-spacing:-1px;color:#111}.brand-name span{color:#f59e0b}
    .brand-sub{color:#888;font-size:.8rem;margin-top:2px}
    .inv-box{text-align:right}.inv-title{font-size:2rem;font-weight:900;color:#f59e0b;letter-spacing:2px}
    .inv-num{font-size:.9rem;color:#555;margin-top:4px}.inv-date{font-size:.82rem;color:#888;margin-top:2px}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:28px 0}
    .section-label{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#aaa;margin-bottom:10px}
    .section-val{font-size:.95rem;line-height:1.7;color:#333}
    .section-val strong{color:#111;font-size:1rem}
    table{width:100%;border-collapse:collapse;margin:28px 0}
    thead tr{background:#f8f8f8}
    th{padding:12px 16px;text-align:left;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#888;border-bottom:2px solid #eee}
    td{padding:14px 16px;font-size:.92rem;border-bottom:1px solid #f0f0f0}
    td.right{text-align:right} th.right{text-align:right}
    .total-section{display:flex;justify-content:flex-end;margin-top:8px}
    .total-box{background:#f8f8f8;border-radius:12px;padding:20px 28px;min-width:240px;border-left:4px solid #f59e0b}
    .total-label{font-size:.75rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#aaa;margin-bottom:6px}
    .total-val{font-size:2rem;font-weight:900;color:#f59e0b}
    .status-chip{display:inline-block;padding:4px 12px;border-radius:20px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.05em}
    .footer{margin-top:48px;padding-top:20px;border-top:1px solid #eee;display:flex;justify-content:space-between;align-items:center;color:#bbb;font-size:.75rem}
    .footer strong{color:#aaa}
    @media print{@page{margin:1.5cm}body{padding:0}button{display:none!important}}
    .print-btn{position:fixed;top:20px;right:20px;background:#f59e0b;color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:.9rem;font-weight:700;cursor:pointer}
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
  <div class="hdr">
    <div>
      <div class="brand-logo"><svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2 5h12M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg></div>
      <div class="brand-name">Fuel<span>Flow</span></div>
      <div class="brand-sub">Gestão de Combustíveis · Moçambique</div>
    </div>
    <div class="inv-box">
      <div class="inv-title">FACTURA</div>
      <div class="inv-num">N.º <strong>${order.reqNum || "S/N"}</strong></div>
      <div class="inv-date">Emitida em: ${fmtDate(order.data)}</div>
      <div class="inv-date">Gerada em: ${new Date().toLocaleDateString("pt-MZ")}</div>
    </div>
  </div>

  <div class="two-col">
    <div>
      <div class="section-label">Fornecedor</div>
      <div class="section-val">
        <strong>FuelFlow Moçambique</strong><br>
        Gestão de Combustíveis<br>
        Maputo, Moçambique
      </div>
    </div>
    <div>
      <div class="section-label">Cliente</div>
      <div class="section-val">
        <strong>${client?.nome || "—"}</strong><br>
        NIF/NUIT: ${client?.nif || "—"}<br>
        ${client?.cidade || ""}${client?.contacto ? " · " + client.contacto : ""}
        ${client?.email ? "<br>" + client.email : ""}
      </div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Descrição</th>
        <th class="right">Quantidade</th>
        <th class="right">Preço Unitário</th>
        <th class="right">Total</th>
        <th>Estado</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td><strong>${product?.nome || "—"}</strong><br><span style="font-size:.82rem;color:#888">Req. N.º ${order.reqNum || "—"} · ${fmtDate(order.data)}</span></td>
        <td class="right">${fmt(order.qtd)} ${product?.unidade || ""}</td>
        <td class="right">${fmt(order.valorUnit)} MT</td>
        <td class="right"><strong>${fmt(order.total)} MT</strong></td>
        <td><span class="status-chip" style="background:${statusColor[order.status] || "#888"}22;color:${statusColor[order.status] || "#888"}">${statusLabel[order.status] || order.status}</span></td>
      </tr>
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-box">
      <div class="total-label">Valor Total a Pagar</div>
      <div class="total-val">${fmt(order.total)} MT</div>
    </div>
  </div>

  <div class="footer">
    <div>FuelFlow · Sistema de Gestão de Combustíveis</div>
    <div>Documento gerado automaticamente em ${new Date().toLocaleDateString("pt-MZ")}</div>
  </div>
  </body></html>`);
  w.document.close();
};

// ─── PDF — EXTRACTO DE CONTA ──────────────────────────────────────────────────
const printExtrato = (client, orders, payments) => {
  const ordersW   = calcOrdersPago(client.id, orders, payments).sort((a, b) => new Date(a.data) - new Date(b.data));
  const clientPay = payments.filter(p => p.clienteId === client.id).sort((a, b) => new Date(a.data) - new Date(b.data));
  const faturado  = ordersW.reduce((s, o) => s + o.total, 0);
  const pago      = clientPay.reduce((s, p) => s + p.valor, 0);
  const saldo     = pago - faturado;

  const events = [
    ...ordersW.map(o => ({ data: o.data, tipo: "Pedido", ref: `Req. ${o.reqNum}`, debito: o.total, credito: 0 })),
    ...clientPay.map(p => ({ data: p.data, tipo: "Pagamento", ref: p.referencia || p.metodo, debito: 0, credito: p.valor })),
  ].sort((a, b) => new Date(a.data) - new Date(b.data));

  let runSaldo = 0;
  const rows = events.map(e => { runSaldo += e.credito - e.debito; return { ...e, saldoAcum: runSaldo }; });

  const w = window.open("", "_blank", "width=900,height=700");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Extracto — ${client.nome}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;padding:48px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:32px;padding-bottom:20px;border-bottom:3px solid #f59e0b}
    .brand-name{font-size:1.4rem;font-weight:900;letter-spacing:-1px;color:#111}.brand-name span{color:#f59e0b}
    .brand-sub{color:#888;font-size:.78rem;margin-top:2px}
    .hdr-right{text-align:right}.hdr-right h2{font-size:1.1rem;font-weight:700;color:#111}.hdr-right p{font-size:.8rem;color:#888;margin-top:3px}
    .summary{display:grid;grid-template-columns:repeat(3,1fr);gap:16px;margin:24px 0}
    .sum-card{background:#f8f8f8;border-radius:10px;padding:16px;border-top:3px solid #ddd}
    .sum-card .l{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#aaa;margin-bottom:6px}
    .sum-card .v{font-size:1.4rem;font-weight:900}
    table{width:100%;border-collapse:collapse;margin-top:8px}
    thead tr{background:#f8f8f8}
    th{padding:10px 14px;text-align:left;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#aaa;border-bottom:2px solid #eee}
    th.right{text-align:right} td.right{text-align:right}
    td{padding:10px 14px;font-size:.85rem;border-bottom:1px solid #f5f5f5}
    .badge{display:inline-block;padding:2px 9px;border-radius:20px;font-size:.68rem;font-weight:700;text-transform:uppercase}
    .badge-pedido{background:#fef3c7;color:#92400e}
    .badge-pag{background:#d1fae5;color:#065f46}
    .cr{color:#059669;font-weight:600}.db{color:#dc2626;font-weight:500}
    .saldo-pos{color:#059669;font-weight:700}.saldo-neg{color:#dc2626;font-weight:700}.saldo-zero{color:#888;font-weight:700}
    .footer{margin-top:36px;padding-top:16px;border-top:1px solid #eee;display:flex;justify-content:space-between;color:#ccc;font-size:.72rem}
    @media print{@page{margin:1.5cm}body{padding:0}button{display:none!important}}
    .print-btn{position:fixed;top:20px;right:20px;background:#f59e0b;color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:.9rem;font-weight:700;cursor:pointer}
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir</button>
  <div class="hdr">
    <div>
      <div class="brand-name">Fuel<span>Flow</span></div>
      <div class="brand-sub">Extracto de Conta Corrente</div>
    </div>
    <div class="hdr-right">
      <h2>${client.nome}</h2>
      <p>NIF: ${client.nif || "—"} · ${client.cidade || ""}${client.contacto ? " · " + client.contacto : ""}</p>
      <p>Gerado em: ${new Date().toLocaleDateString("pt-MZ")}</p>
    </div>
  </div>

  <div class="summary">
    <div class="sum-card" style="border-top-color:#f59e0b">
      <div class="l">Total Faturado</div>
      <div class="v" style="color:#d97706">${fmt(faturado)} MT</div>
    </div>
    <div class="sum-card" style="border-top-color:#059669">
      <div class="l">Total Pago</div>
      <div class="v" style="color:#059669">${fmt(pago)} MT</div>
    </div>
    <div class="sum-card" style="border-top-color:${saldo < 0 ? "#dc2626" : saldo > 0 ? "#059669" : "#aaa"}">
      <div class="l">Saldo Actual</div>
      <div class="v ${saldo < -0.01 ? "saldo-neg" : saldo > 0.01 ? "saldo-pos" : "saldo-zero"}">${saldo < -0.01 ? "−" : saldo > 0.01 ? "+" : ""}${fmt(Math.abs(saldo))} MT</div>
    </div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Data</th><th>Tipo</th><th>Referência</th>
        <th class="right">Débito</th><th class="right">Crédito</th><th class="right">Saldo Acumulado</th>
      </tr>
    </thead>
    <tbody>
      ${rows.map(r => `<tr>
        <td>${fmtDate(r.data)}</td>
        <td><span class="badge ${r.tipo === "Pedido" ? "badge-pedido" : "badge-pag"}">${r.tipo}</span></td>
        <td>${r.ref || "—"}</td>
        <td class="right db">${r.debito > 0 ? fmt(r.debito) + " MT" : "—"}</td>
        <td class="right cr">${r.credito > 0 ? fmt(r.credito) + " MT" : "—"}</td>
        <td class="right ${r.saldoAcum < -0.01 ? "saldo-neg" : r.saldoAcum > 0.01 ? "saldo-pos" : "saldo-zero"}">${r.saldoAcum < -0.01 ? "−" : r.saldoAcum > 0.01 ? "+" : ""}${fmt(Math.abs(r.saldoAcum))} MT</td>
      </tr>`).join("")}
    </tbody>
  </table>

  <div class="footer">
    <span>FuelFlow · Gestão de Combustíveis · Moçambique</span>
    <span>Documento gerado automaticamente · ${new Date().toLocaleDateString("pt-MZ")}</span>
  </div>
  </body></html>`);
  w.document.close();
};

// ─── ICONS ───────────────────────────────────────────────────────────────────
const Icon = ({ name, size = 18 }) => {
  const icons = {
    dashboard: "M3 3h8v8H3zm10 0h8v8h-8zM3 13h8v8H3zm10 0h8v8h-8z",
    clients:   "M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zm8 0a3 3 0 0 0 0-6m4 16v-2a4 4 0 0 0-3-3.87",
    products:  "M21 10V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 2 8v2m19 0-9 5-9-5m9 5v9M3 10l9 5 9-5",
    orders:    "M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2M9 5a2 2 0 0 0 2 2h2a2 2 0 0 0 2-2M9 5a2 2 0 0 0 2-2h2a2 2 0 0 0 2 2m-6 9 2 2 4-4",
    payments:  "M3 10h18M7 15h1m4 0h1m-7 4h12a3 3 0 0 0 3-3V8a3 3 0 0 0-3-3H6a3 3 0 0 0-3 3v8a3 3 0 0 0 3 3z",
    reports:   "M18 20V10M12 20V4M6 20v-6",
    plus:      "M12 5v14M5 12h14",
    edit:      "M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z",
    trash:     "M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6",
    close:     "M18 6L6 18M6 6l12 12",
    save:      "M19 21H5a2 2 0 0 0-2-2V5a2 2 0 0 0 2-2h11l5 5v11a2 2 0 0 0-2 2zM17 21v-8H7v8M7 3v5h8",
    search:    "M21 21l-6-6m2-5a7 7 0 1 1-14 0 7 7 0 0 1 14 0z",
    fuel:      "M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2 5h12M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z",
    arrow:     "M5 12h14M12 5l7 7-7 7",
    check:     "M20 6L9 17l-5-5",
    alert:     "M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01",
    money:     "M12 1v22M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6",
    print:     "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
    collapse:  "M15 18l-6-6 6-6",
    history:   "M3 3v5h5M3.05 13A9 9 0 1 0 6 5.3L3 8",
    tag:       "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82zM7 7h.01",
    wallet:    "M21 12V7H5a2 2 0 0 1 0-4h14v4M21 12a2 2 0 0 1 0 4H5a2 2 0 0 1 0-4h16z",
    print:     "M6 9V2h12v7M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2M6 14h12v8H6z",
    file:      "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6M16 13H8M16 17H8M10 9H8",
  };
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d={icons[name] || ""} />
    </svg>
  );
};

// ─── UI PRIMITIVES ───────────────────────────────────────────────────────────
const Modal = ({ title, children, onClose, wide }) => (
  <div className="modal-overlay" style={{ position:"fixed", inset:0, background:"rgba(2,6,14,0.85)", backdropFilter:"blur(8px)", zIndex:1000, display:"flex", alignItems:"center", justifyContent:"center", padding:"1rem" }}>
    <div className="modal-box" style={{ background:"linear-gradient(145deg,#0d1b2e,#0a1525)", border:"1px solid rgba(255,255,255,0.06)", borderRadius:"20px", width:"100%", maxWidth:wide?"820px":"540px", maxHeight:"92vh", overflow:"auto", boxShadow:"0 32px 80px rgba(0,0,0,0.7),0 0 0 1px rgba(245,158,11,0.06)" }}>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", padding:"1.5rem 1.8rem 1.2rem", borderBottom:"1px solid rgba(255,255,255,0.05)" }}>
        <div>
          <h3 style={{ color:"#f1f5f9", margin:0, fontSize:"1rem", fontFamily:"'Syne',sans-serif", fontWeight:700, letterSpacing:"-0.01em" }}>{title}</h3>
        </div>
        <button onClick={onClose} style={{ background:"rgba(255,255,255,0.04)", border:"1px solid rgba(255,255,255,0.07)", borderRadius:"8px", color:"#475569", cursor:"pointer", padding:"6px", display:"flex", alignItems:"center", justifyContent:"center" }}><Icon name="close" size={16}/></button>
      </div>
      <div style={{ padding:"1.8rem" }}>{children}</div>
    </div>
  </div>
);

const Field = ({ label, children }) => (
  <div style={{ marginBottom:"1.1rem" }}>
    <label style={{ display:"block", color:"#475569", fontSize:"0.7rem", marginBottom:"7px", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600 }}>{label}</label>
    {children}
  </div>
);

const Input = ({ style, ...props }) => (
  <input {...props} style={{ width:"100%", padding:"0.62rem 0.95rem", background:"rgba(255,255,255,0.03)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"10px", color:"#e2e8f0", fontSize:"0.88rem", outline:"none", boxSizing:"border-box", fontFamily:"inherit", ...style }} />
);

const Select = ({ style, children, ...props }) => (
  <select {...props} style={{ width:"100%", padding:"0.62rem 0.95rem", background:"rgba(10,18,30,0.8)", border:"1px solid rgba(255,255,255,0.08)", borderRadius:"10px", color:"#e2e8f0", fontSize:"0.88rem", outline:"none", boxSizing:"border-box", fontFamily:"inherit", ...style }}>
    {children}
  </select>
);

const Btn = ({ onClick, children, variant="primary", small, icon, style, disabled }) => {
  const styles = {
    primary:   { background:"linear-gradient(135deg,#f59e0b,#d97706)", color:"#000", border:"none", fontWeight:700 },
    secondary: { background:"rgba(255,255,255,0.04)", color:"#94a3b8", border:"1px solid rgba(255,255,255,0.08)", fontWeight:500 },
    danger:    { background:"rgba(239,68,68,0.08)", color:"#f87171", border:"1px solid rgba(239,68,68,0.2)", fontWeight:600 },
    ghost:     { background:"rgba(245,158,11,0.08)", color:"#f59e0b", border:"1px solid rgba(245,158,11,0.2)", fontWeight:600 },
    green:     { background:"rgba(16,185,129,0.08)", color:"#34d399", border:"1px solid rgba(16,185,129,0.2)", fontWeight:600 },
    blue:      { background:"rgba(59,130,246,0.08)", color:"#60a5fa", border:"1px solid rgba(59,130,246,0.2)", fontWeight:600 },
  };
  return (
    <button onClick={onClick} disabled={disabled} className={variant==="primary"?"btn-primary":""} style={{ ...styles[variant], padding:small?"0.32rem 0.75rem":"0.55rem 1.15rem", borderRadius:"10px", cursor:disabled?"not-allowed":"pointer", opacity:disabled?0.45:1, fontSize:small?"0.76rem":"0.84rem", display:"inline-flex", alignItems:"center", gap:"6px", whiteSpace:"nowrap", letterSpacing:small?0:"-0.01em", ...style }}>
      {icon && <Icon name={icon} size={small?12:14}/>}{children}
    </button>
  );
};

const Badge = ({ status }) => {
  const cfg = {
    entregue: { color:"#34d399", bg:"rgba(16,185,129,0.1)",  border:"rgba(16,185,129,0.2)",  label:"Entregue"  },
    pendente: { color:"#fbbf24", bg:"rgba(245,158,11,0.1)",  border:"rgba(245,158,11,0.2)",  label:"Pendente"  },
    cancelado:{ color:"#f87171", bg:"rgba(239,68,68,0.08)",  border:"rgba(239,68,68,0.2)",   label:"Cancelado" },
    pago:     { color:"#34d399", bg:"rgba(16,185,129,0.1)",  border:"rgba(16,185,129,0.2)",  label:"Pago"      },
    parcial:  { color:"#60a5fa", bg:"rgba(59,130,246,0.1)",  border:"rgba(59,130,246,0.2)",  label:"Parcial"   },
    divida:   { color:"#f87171", bg:"rgba(239,68,68,0.08)",  border:"rgba(239,68,68,0.2)",   label:"Por pagar" },
  };
  const c = cfg[status] || { color:"#475569", bg:"rgba(100,116,139,0.1)", border:"rgba(100,116,139,0.2)", label:status };
  return <span style={{ padding:"3px 10px", borderRadius:"999px", fontSize:"0.68rem", fontWeight:700, color:c.color, background:c.bg, border:`1px solid ${c.border}`, letterSpacing:"0.04em", textTransform:"uppercase", whiteSpace:"nowrap" }}>{c.label}</span>;
};

const StatCard = ({ label, value, sub, color, icon }) => (
  <div className="stat-card" style={{ background:"linear-gradient(145deg,#0d1b2e,#091422)", border:"1px solid rgba(255,255,255,0.05)", borderRadius:"16px", padding:"1.5rem", position:"relative", overflow:"hidden", boxShadow:"0 4px 20px rgba(0,0,0,0.3)" }}>
    <div style={{ position:"absolute", top:0, left:0, right:0, height:"2px", background:`linear-gradient(90deg,${color},${color}00)` }}/>
    <div style={{ position:"absolute", top:"-20px", right:"-10px", width:"80px", height:"80px", borderRadius:"50%", background:color, opacity:0.04, filter:"blur(20px)" }}/>
    <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start" }}>
      <div style={{ flex:1 }}>
        <div style={{ color:"#475569", fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.12em", marginBottom:"0.7rem", fontWeight:600 }}>{label}</div>
        <div style={{ color:"#f1f5f9", fontSize:"1.55rem", fontWeight:700, fontFamily:"'Syne',sans-serif", lineHeight:1, letterSpacing:"-0.02em" }}>{value}</div>
        {sub && <div style={{ color:"#475569", fontSize:"0.73rem", marginTop:"0.5rem" }}>{sub}</div>}
      </div>
      <div style={{ width:"40px", height:"40px", borderRadius:"12px", background:`${color}18`, border:`1px solid ${color}30`, display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, color }}>
        <Icon name={icon} size={18}/>
      </div>
    </div>
  </div>
);

const Table = ({ headers, children }) => (
  <div style={{ overflowX:"auto" }}>
    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.83rem" }}>
      <thead>
        <tr style={{ background:"rgba(255,255,255,0.02)" }}>
          {headers.map((h,i) => (
            <th key={i} style={{ padding:"0.75rem 1.1rem", textAlign:"left", color:"#475569", fontWeight:600, fontSize:"0.66rem", textTransform:"uppercase", letterSpacing:"0.1em", borderBottom:"1px solid rgba(255,255,255,0.05)", whiteSpace:"nowrap" }}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>{children}</tbody>
    </table>
  </div>
);

const TR = ({ children }) => (
  <tr className="tr-hover" style={{ borderBottom:"1px solid rgba(255,255,255,0.03)", cursor:"default" }}>{children}</tr>
);

const TD = ({ children, right, bold, muted, style }) => (
  <td style={{ padding:"0.85rem 1.1rem", color:muted?"#475569":bold?"#f1f5f9":"#94a3b8", textAlign:right?"right":"left", whiteSpace:"nowrap", ...style }}>{children}</td>
);

// TipoBadge
const TipoBadge = ({ tipo }) => {
  const isPre = tipo === "pre-pago";
  const color = isPre ? "#60a5fa" : "#a78bfa";
  return (
    <span style={{ padding:"2px 8px", borderRadius:"999px", fontSize:"0.65rem", fontWeight:700, letterSpacing:"0.06em", textTransform:"uppercase", background:color+"15", border:`1px solid ${color}35`, color }}>
      {isPre ? "↑ Pré" : "↓ Pós"}
    </span>
  );
};

// SaldoBadge — ciente do tipo de cliente
const SaldoBadge = ({ saldo, tipo, large }) => {
  const devedor = saldo < -0.01;
  const neutro  = Math.abs(saldo) < 0.01;
  const isPre   = tipo === "pre-pago";
  let color, bg, border, label;
  if (neutro) {
    color="#64748b"; bg="rgba(100,116,139,0.08)"; border="rgba(100,116,139,0.2)";
    label = isPre ? "Sem saldo" : "Liquidado";
  } else if (isPre) {
    color  = devedor ? "#f87171" : "#60a5fa";
    bg     = devedor ? "rgba(239,68,68,0.08)" : "rgba(59,130,246,0.08)";
    border = devedor ? "rgba(239,68,68,0.2)"  : "rgba(59,130,246,0.2)";
    label  = devedor ? `⚠ Excedido: ${fmt(Math.abs(saldo))} MT` : `Disponível: ${fmt(saldo)} MT`;
  } else {
    color  = devedor ? "#f87171" : "#34d399";
    bg     = devedor ? "rgba(239,68,68,0.08)" : "rgba(16,185,129,0.08)";
    border = devedor ? "rgba(239,68,68,0.2)"  : "rgba(16,185,129,0.2)";
    label  = devedor ? `Em dívida: ${fmt(Math.abs(saldo))} MT` : `Crédito: ${fmt(saldo)} MT`;
  }
  return (
    <div style={{ display:"inline-flex", alignItems:"center", gap:"6px", padding:large?"0.45rem 1rem":"3px 10px", borderRadius:"999px", background:bg, border:`1px solid ${border}`, color, fontWeight:700, fontSize:large?"0.88rem":"0.72rem" }}>
      <span style={{ fontSize:large?"0.8rem":"0.65rem" }}>{neutro?"●":devedor?"▼":"▲"}</span>
      <span>{label}</span>
    </div>
  );
};

// ════════════════════════════════════════════════════════════════════════════
// ─── SHARED LAYOUT COMPONENTS ────────────────────────────────────────────────
const C = {
  bg:     "linear-gradient(160deg,#0c1929 0%,#091520 100%)",
  bgDeep: "rgba(0,0,0,0.25)",
  border: "1px solid rgba(255,255,255,0.06)",
  borderFaint: "1px solid rgba(255,255,255,0.03)",
  radius: "16px",
  shadow: "0 2px 20px rgba(0,0,0,0.35)",
};

const Card = ({ children, style, pad }) => (
  <div style={{ background:C.bg, border:C.border, borderRadius:C.radius, boxShadow:C.shadow, padding:pad??0, overflow:"hidden", ...style }}>
    {children}
  </div>
);

const CardHeader = ({ title, action, sub }) => (
  <div style={{ padding:"1.1rem 1.4rem", borderBottom:C.borderFaint, display:"flex", justifyContent:"space-between", alignItems:"center", gap:"1rem" }}>
    <div>
      <div style={{ color:"#cbd5e1", fontWeight:600, fontSize:"0.85rem", letterSpacing:"-0.01em" }}>{title}</div>
      {sub && <div style={{ color:"#475569", fontSize:"0.72rem", marginTop:"2px" }}>{sub}</div>}
    </div>
    {action && <div style={{ flexShrink:0 }}>{action}</div>}
  </div>
);

const PageHeader = ({ title, sub, action }) => (
  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.8rem", gap:"1rem" }}>
    <div>
      <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.3rem", margin:"0 0 0.25rem", fontWeight:700, letterSpacing:"-0.025em" }}>{title}</h2>
      {sub && <p style={{ color:"#475569", fontSize:"0.82rem", margin:0 }}>{sub}</p>}
    </div>
    {action && <div style={{ flexShrink:0 }}>{action}</div>}
  </div>
);

const IconBtn = ({ onClick, icon, color="#f59e0b", title }) => (
  <button onClick={onClick} title={title} style={{ background:`${color}12`, border:`1px solid ${color}25`, borderRadius:"8px", color, cursor:"pointer", padding:"6px", display:"flex", alignItems:"center", justifyContent:"center" }}>
    <Icon name={icon} size={13}/>
  </button>
);

const SearchBar = ({ value, onChange, placeholder }) => (
  <div style={{ display:"flex", gap:"0.6rem", alignItems:"center", background:"rgba(255,255,255,0.03)", border:C.border, borderRadius:"12px", padding:"0.55rem 1rem", flex:1, minWidth:"180px" }}>
    <Icon name="search" size={15} style={{ color:"#475569", flexShrink:0 }}/>
    <input value={value} onChange={onChange} placeholder={placeholder||"Pesquisar..."} style={{ background:"none", border:"none", outline:"none", color:"#e2e8f0", flex:1, fontSize:"0.85rem", fontFamily:"inherit" }}/>
  </div>
);

const FilterPill = ({ label, active, onClick, activeColor="#f59e0b" }) => (
  <button onClick={onClick} style={{ padding:"4px 12px", borderRadius:"999px", border:`1px solid`, fontSize:"0.71rem", cursor:"pointer", fontWeight:600, letterSpacing:"0.02em", borderColor:active?activeColor:"rgba(255,255,255,0.08)", background:active?`${activeColor}15`:"transparent", color:active?activeColor:"#475569", transition:"all 0.15s" }}>
    {label}
  </button>
);

// DASHBOARD
// ════════════════════════════════════════════════════════════════════════════
function Dashboard({ orders, clients, products, payments, onNavTo }) {
  const totalFaturado = orders.filter(o=>o.status!=="cancelado").reduce((s,o)=>s+o.total,0);
  const totalRecebido = payments.reduce((s,p)=>s+p.valor,0);
  const totalDivida   = Math.max(0, totalFaturado-totalRecebido);
  const totalLitros   = orders.reduce((s,o)=>s+o.qtd,0);

  const byProduct = products.map(p=>({ ...p, total: orders.filter(o=>o.produtoId===p.id).reduce((s,o)=>s+o.total,0) })).filter(p=>p.total>0);
  const clientSaldos = clients.map(c=>({...c,...calcSaldo(c.id,orders,payments)})).sort((a,b)=>a.saldo-b.saldo);
  const recent = [...orders].sort((a,b)=>new Date(b.data)-new Date(a.data)).slice(0,5);

  return (
    <div>
      <PageHeader title="Dashboard" sub="Visão geral do sistema de gestão de combustíveis"/>

      {/* KPI row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(200px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
        <StatCard label="Total Faturado"   value={`${fmt(totalFaturado)} MT`} sub={`${orders.length} pedidos`}      color="#f59e0b" icon="money"/>
        <StatCard label="Total Recebido"   value={`${fmt(totalRecebido)} MT`} sub={`${payments.length} pagamentos`} color="#10b981" icon="payments"/>
        <StatCard label="Por Receber"      value={`${fmt(totalDivida)} MT`}   sub="em aberto"                       color="#ef4444" icon="alert"/>
        <StatCard label="Volume Fornecido" value={`${fmt(totalLitros)} L`}    sub="todos os produtos"               color="#3b82f6" icon="fuel"/>
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.2rem", marginBottom:"1.2rem" }}>
        {/* Vendas por Produto */}
        <Card>
          <CardHeader title="Vendas por Produto"/>
          <div style={{ padding:"1.3rem 1.4rem" }}>
            {byProduct.map(p => {
              const pct = totalFaturado?(p.total/totalFaturado)*100:0;
              return (
                <div key={p.id} style={{ marginBottom:"1.1rem" }}>
                  <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"6px" }}>
                    <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                      <div style={{ width:"8px", height:"8px", borderRadius:"50%", background:p.cor, flexShrink:0 }}/>
                      <span style={{ color:"#cbd5e1", fontSize:"0.83rem" }}>{p.nome}</span>
                    </div>
                    <span style={{ color:p.cor, fontSize:"0.82rem", fontWeight:600 }}>{fmt(p.total)} MT</span>
                  </div>
                  <div style={{ height:"5px", background:"rgba(255,255,255,0.05)", borderRadius:"999px" }}>
                    <div style={{ height:"100%", width:`${pct}%`, background:p.cor, borderRadius:"999px", boxShadow:`0 0 6px ${p.cor}60` }}/>
                  </div>
                  <div style={{ color:"#334155", fontSize:"0.68rem", marginTop:"4px", textAlign:"right" }}>{pct.toFixed(1)}%</div>
                </div>
              );
            })}
          </div>
        </Card>

        {/* Saldos dos Clientes */}
        <Card>
          <CardHeader title="Saldos dos Clientes" action={
            <button onClick={()=>onNavTo("payments")} style={{ background:"none", border:"none", color:"#f59e0b", cursor:"pointer", fontSize:"0.75rem", fontWeight:600, padding:0 }}>Ver tudo →</button>
          }/>
          <div style={{ padding:"1rem 1.2rem", display:"flex", flexDirection:"column", gap:"0.6rem" }}>
            {clientSaldos.map(c => (
              <div key={c.id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"0.75rem 1rem", background:C.bgDeep, borderRadius:"12px", border: c.saldo<-0.01?"1px solid rgba(248,113,113,0.15)":C.borderFaint }}>
                <div style={{ minWidth:0 }}>
                  <div style={{ color:"#e2e8f0", fontSize:"0.82rem", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap" }}>{c.nome.split(",")[0]}</div>
                  <div style={{ color:"#334155", fontSize:"0.7rem", marginTop:"2px" }}>Fat: {fmt(c.faturado)} · Pago: {fmt(c.pago)} MT</div>
                </div>
                <div style={{ marginLeft:"0.8rem", flexShrink:0 }}><SaldoBadge saldo={c.saldo} tipo={c.tipo}/></div>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Pedidos Recentes */}
      <Card>
        <CardHeader title="Pedidos Recentes" sub={`${recent.length} mais recentes`}/>
        <Table headers={["Data","Req.","Cliente","Produto","Qtd.","Total","Pago","Dívida","Estado"]}>
          {recent.map(o => {
            const c  = clients.find(x=>x.id===o.clienteId);
            const p  = products.find(x=>x.id===o.produtoId);
            const wp = calcOrdersPago(o.clienteId,orders,payments).find(x=>x.id===o.id);
            return (
              <TR key={o.id}>
                <TD muted>{fmtDate(o.data)}</TD>
                <TD bold>{o.reqNum}</TD>
                <TD>{c?.nome?.split(",")[0]||"—"}</TD>
                <TD><span style={{color:p?.cor,fontWeight:600}}>{p?.nome}</span></TD>
                <TD right muted>{fmt(o.qtd)} {p?.unidade}</TD>
                <TD bold right style={{color:"#f1f5f9"}}>{fmt(o.total)} MT</TD>
                <TD right style={{color:"#34d399"}}>{fmt(wp?.valorPago||0)} MT</TD>
                <TD right style={{color:(wp?.valorDivida||0)>0.01?"#f87171":"#334155"}}>{fmt(wp?.valorDivida||0)} MT</TD>
                <TD>{wp&&<Badge status={wp.estadoPag}/>}</TD>
              </TR>
            );
          })}
        </Table>
      </Card>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// CLIENTS
// ════════════════════════════════════════════════════════════════════════════
function Clients({ clients, orders, payments, onSave, onDelete, onNavTo }) {
  const [search, setSearch] = useState("");
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({});
  const [detail, setDetail] = useState(null);

  const filtered = clients.filter(c=>c.nome.toLowerCase().includes(search.toLowerCase())||(c.nif||"").includes(search));
  const openNew  = () => { setForm({nome:"",nif:"",contacto:"",email:"",cidade:"Maputo",tipo:"pos-pago"}); setModal(true); };
  const openEdit = (c) => { setForm({...c}); setModal(true); };
  const handleSave = () => { if(!form.nome) return; onSave({...form,id:form.id||genId()}); setModal(false); };

  if (detail) {
    const c = clients.find(x=>x.id===detail);
    if (!c) { setDetail(null); return null; }
    const { faturado, pago, saldo } = calcSaldo(c.id,orders,payments);
    const ordersW  = calcOrdersPago(c.id,orders,payments).sort((a,b)=>new Date(b.data)-new Date(a.data));
    const clientPay = payments.filter(p=>p.clienteId===c.id).sort((a,b)=>new Date(b.data)-new Date(a.data));
    const isPre = c.tipo === "pre-pago";
    return (
      <div>
        <button onClick={()=>setDetail(null)} style={{ background:"rgba(245,158,11,0.06)", border:"1px solid rgba(245,158,11,0.15)", borderRadius:"8px", color:"#f59e0b", cursor:"pointer", display:"flex", alignItems:"center", gap:"6px", marginBottom:"1.8rem", fontSize:"0.8rem", fontWeight:600, padding:"0.4rem 0.9rem" }}>
          <Icon name="collapse" size={16}/> Voltar aos Clientes
        </button>
        <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"1.5rem", flexWrap:"wrap", gap:"1rem" }}>
          <div>
            <div style={{ display:"flex", alignItems:"center", gap:"10px", marginBottom:"4px" }}>
              <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.4rem", margin:0 }}>{c.nome}</h2>
              <TipoBadge tipo={c.tipo||"pos-pago"}/>
            </div>
            <p style={{ color:"#475569", fontSize:"0.8rem", margin:0 }}>NIF: {c.nif||"—"} · {c.cidade} · {c.contacto}</p>
          </div>
          <div style={{ display:"flex", gap:"0.6rem", flexWrap:"wrap" }}>
            <Btn onClick={()=>printExtrato(c, orders, payments)} icon="print" variant="secondary">Imprimir Extracto</Btn>
            {isPre
              ? <Btn onClick={()=>onNavTo("payments",c.id)} icon="wallet" variant="blue">Carregar Crédito</Btn>
              : <Btn onClick={()=>onNavTo("faturas",c.id)}  icon="file"   variant="ghost">Emitir Fatura</Btn>
            }
          </div>
        </div>

        {/* Saldo card adaptado ao tipo */}
        <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
          {isPre ? (
            <>
              <StatCard label="Total Depositado"  value={`${fmt(pago)} MT`}      color="#3b82f6" icon="payments"/>
              <StatCard label="Total Consumido"   value={`${fmt(faturado)} MT`}  color="#f59e0b" icon="money"/>
            </>
          ) : (
            <>
              <StatCard label="Total Faturado"    value={`${fmt(faturado)} MT`}  color="#f59e0b" icon="money"/>
              <StatCard label="Total Pago"        value={`${fmt(pago)} MT`}      color="#10b981" icon="payments"/>
            </>
          )}
          <div style={{ background:C.bg, border:`2px solid ${isPre?(saldo<0?"rgba(239,68,68,0.4)":saldo>5?"rgba(59,130,246,0.4)":"rgba(245,158,11,0.3)"):(saldo<0?"rgba(239,68,68,0.4)":saldo>0?"rgba(16,185,129,0.4)":"#1e3a5f")}`, borderRadius:"16px", padding:"1.5rem", position:"relative", overflow:"hidden" }}>
            <div style={{ position:"absolute", top:0, left:0, right:0, height:"3px", background: isPre?(saldo<0?"#ef4444":saldo>5?"#3b82f6":"#f59e0b"):(saldo<0?"#ef4444":saldo>0?"#10b981":"#64748b") }}/>
            <div style={{ color:"#475569", fontSize:"0.72rem", textTransform:"uppercase", letterSpacing:"0.1em", marginBottom:"0.5rem" }}>
              {isPre ? "Saldo Disponível" : "Saldo da Conta"}
            </div>
            <div style={{ fontSize:"1.6rem", fontWeight:700, fontFamily:"'Syne',sans-serif", color: isPre?(saldo<0?"#ef4444":saldo>5?"#3b82f6":"#f59e0b"):(saldo<0?"#ef4444":saldo>0?"#10b981":"#64748b") }}>
              {saldo<0?"−":saldo>0?"+":""}{fmt(Math.abs(saldo))} MT
            </div>
            <div style={{ color:"#475569", fontSize:"0.75rem", marginTop:"0.4rem" }}>
              {isPre
                ? (saldo<0?"⚠ Limite excedido":saldo<100?"⚠ Saldo baixo":"✓ Saldo disponível")
                : (saldo<0?"⚠ Em dívida":saldo>0?"✓ Crédito":"✓ Liquidado")
              }
            </div>
          </div>
        </div>

        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5rem" }}>
          <div>
            <h4 style={{ color:"#475569", margin:"0 0 0.7rem", fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600 }}>
              {isPre ? "Pedidos (Consumos)" : "Pedidos & Estado de Pagamento"}
            </h4>
            <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden" }}>
              <Table headers={isPre ? ["Data","Req.","Produto","Total","Consumido"] : ["Data","Req.","Total","Pago","Dívida","Estado"]}>
                {ordersW.map(o=>(
                  <TR key={o.id}>
                    <TD muted>{fmtDate(o.data)}</TD>
                    <TD bold>{o.reqNum}</TD>
                    {isPre && <TD muted></TD>}
                    <TD right>{fmt(o.total)} MT</TD>
                    {isPre
                      ? <TD right style={{color:"#3b82f6"}}>−{fmt(o.valorPago)} MT</TD>
                      : <>
                          <TD right style={{color:"#10b981"}}>{fmt(o.valorPago)} MT</TD>
                          <TD right style={{color:o.valorDivida>0.01?"#ef4444":"#64748b"}}>{fmt(o.valorDivida)} MT</TD>
                          <TD><Badge status={o.estadoPag}/></TD>
                        </>
                    }
                  </TR>
                ))}
              </Table>
              {ordersW.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"#475569"}}>Sem pedidos</div>}
            </div>
          </div>
          <div>
            <h4 style={{ color:"#475569", margin:"0 0 0.7rem", fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.1em", fontWeight:600 }}>
              {isPre ? "Histórico de Depósitos" : "Histórico de Pagamentos"}
            </h4>
            <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden" }}>
              <Table headers={["Data","Referência","Método","Valor"]}>
                {clientPay.map(p=>(
                  <TR key={p.id}>
                    <TD muted>{fmtDate(p.data)}</TD>
                    <TD>{p.referencia||"—"}</TD>
                    <TD muted>{p.metodo}</TD>
                    <TD bold right style={{color:isPre?"#3b82f6":"#10b981"}}>+{fmt(p.valor)} MT</TD>
                  </TR>
                ))}
              </Table>
              {clientPay.length===0&&<div style={{textAlign:"center",padding:"2rem",color:"#475569"}}>
                {isPre?"Sem depósitos":"Sem pagamentos"}
              </div>}
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" }}>
        <div>
          <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.25rem", margin:"0 0 0.25rem", fontWeight:700, letterSpacing:"-0.025em" }}>Clientes</h2>
          <p style={{ color:"#475569", fontSize:"0.8rem", margin:0 }}>{clients.length} clientes cadastrados</p>
        </div>
        <Btn onClick={openNew} icon="plus">Novo Cliente</Btn>
      </div>
      <div style={{ background:C.bg, border:C.border, borderRadius:"12px", padding:"0.65rem 1rem", marginBottom:"1.5rem", display:"flex", gap:"0.6rem", alignItems:"center" }}>
        <Icon name="search" size={16}/>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar por nome, NIF..." style={{ background:"none", border:"none", outline:"none", color:"#e2e8f0", flex:1, fontSize:"0.9rem" }}/>
      </div>
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fill,minmax(320px,1fr))", gap:"1rem" }}>
        {filtered.map(c => {
          const { faturado, pago, saldo } = calcSaldo(c.id,orders,payments);
          const isPre   = c.tipo === "pre-pago";
          // borda: pré-pago fica vermelha se excedeu crédito; pós-pago fica vermelha se tem dívida
          const alertBorder = saldo < -0.01 ? "rgba(239,68,68,0.25)" : isPre && saldo < 10 ? "rgba(245,158,11,0.25)" : "#1e3a5f";
          return (
            <div key={c.id} style={{ background:C.bg, border:`1px solid ${alertBorder}`, borderRadius:"16px", padding:"1.5rem" }}>
              <div style={{ display:"flex", justifyContent:"space-between", alignItems:"flex-start", marginBottom:"0.6rem" }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:"flex", alignItems:"center", gap:"8px", marginBottom:"4px", flexWrap:"wrap" }}>
                    <div style={{ color:"#f1f5f9", fontWeight:700, fontSize:"0.92rem" }}>{c.nome.split(",")[0]}</div>
                    <TipoBadge tipo={c.tipo||"pos-pago"}/>
                  </div>
                  <div style={{ color:"#475569", fontSize:"0.74rem" }}>NIF: {c.nif||"—"} · {c.cidade}</div>
                </div>
                <div style={{ display:"flex", gap:"5px", marginLeft:"8px" }}>
                  <button onClick={()=>openEdit(c)} style={{ background:"rgba(245,158,11,0.1)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:"6px", color:"#f59e0b", cursor:"pointer", padding:"5px", display:"flex" }}><Icon name="edit" size={13}/></button>
                  <button onClick={()=>onDelete(c.id)} style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:"6px", color:"#ef4444", cursor:"pointer", padding:"5px", display:"flex" }}><Icon name="trash" size={13}/></button>
                </div>
              </div>

              {/* Stats */}
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0.5rem", marginBottom:"0.9rem" }}>
                {(isPre
                  ? [["Depositado",fmt(pago),"#3b82f6"],["Consumido",fmt(faturado),"#f59e0b"],["Pedidos",orders.filter(o=>o.clienteId===c.id).length,"#94a3b8"]]
                  : [["Faturado",fmt(faturado),"#f59e0b"],["Pago",fmt(pago),"#10b981"],["Pedidos",orders.filter(o=>o.clienteId===c.id).length,"#94a3b8"]]
                ).map(([l,v,col])=>(
                  <div key={l} style={{ background:"rgba(0,0,0,0.3)", borderRadius:"10px", padding:"0.65rem 0.5rem", textAlign:"center" }}>
                    <div style={{ color:col, fontWeight:700, fontSize:"0.88rem" }}>{v}</div>
                    <div style={{ color:"#475569", fontSize:"0.65rem" }}>{l}</div>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom:"0.8rem" }}><SaldoBadge saldo={saldo} tipo={c.tipo}/></div>
              <div style={{ display:"flex", gap:"0.5rem" }}>
                <button onClick={()=>setDetail(c.id)} style={{ flex:1, padding:"0.45rem", background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.2)", borderRadius:"7px", color:"#f59e0b", cursor:"pointer", fontSize:"0.78rem", fontWeight:600 }}>Ver Detalhes</button>
                <button onClick={()=>onNavTo(isPre?"payments":"faturas",c.id)} style={{ flex:1, padding:"0.45rem", background: isPre?"rgba(59,130,246,0.08)":"rgba(139,92,246,0.08)", border:`1px solid ${isPre?"rgba(59,130,246,0.2)":"rgba(139,92,246,0.2)"}`, borderRadius:"7px", color:isPre?"#3b82f6":"#8b5cf6", cursor:"pointer", fontSize:"0.78rem", fontWeight:600 }}>
                  {isPre ? "⬆ Carregar Crédito" : "⬇ Emitir Fatura"}
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {modal && (
        <Modal title={form.id?"Editar Cliente":"Novo Cliente"} onClose={()=>setModal(false)}>
          <Field label="Nome / Razão Social *"><Input value={form.nome||""} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Nome da empresa"/></Field>

          {/* Tipo de cliente — destaque visual */}
          <Field label="Tipo de Cliente *">
            <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"0.6rem" }}>
              {[
                { val:"pre-pago", icon:"⬆", label:"Pré-pago",  desc:"Paga adiantado e vai consumindo o crédito", color:"#3b82f6" },
                { val:"pos-pago", icon:"⬇", label:"Pós-pago",  desc:"Recebe fornecimento e paga via fatura mensal", color:"#8b5cf6" },
              ].map(opt => (
                <div key={opt.val} onClick={() => setForm({...form, tipo:opt.val})}
                  style={{ padding:"0.9rem 1rem", borderRadius:"10px", cursor:"pointer", border:`2px solid ${form.tipo===opt.val ? opt.color : "#1e3a5f"}`, background: form.tipo===opt.val ? opt.color+"15" : C.bgDeep, transition:"all 0.2s" }}>
                  <div style={{ color: form.tipo===opt.val ? opt.color : "#94a3b8", fontWeight:700, fontSize:"0.88rem", marginBottom:"3px" }}>{opt.icon} {opt.label}</div>
                  <div style={{ color:"#475569", fontSize:"0.72rem", lineHeight:1.4 }}>{opt.desc}</div>
                </div>
              ))}
            </div>
          </Field>

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
            <Field label="NIF / NUIT"><Input value={form.nif||""} onChange={e=>setForm({...form,nif:e.target.value})} placeholder="400000000"/></Field>
            <Field label="Cidade"><Input value={form.cidade||""} onChange={e=>setForm({...form,cidade:e.target.value})} placeholder="Maputo"/></Field>
            <Field label="Contacto"><Input value={form.contacto||""} onChange={e=>setForm({...form,contacto:e.target.value})} placeholder="21-000000"/></Field>
            <Field label="Email"><Input value={form.email||""} onChange={e=>setForm({...form,email:e.target.value})} placeholder="geral@empresa.co.mz"/></Field>
          </div>
          <div style={{ display:"flex", gap:"0.8rem", justifyContent:"flex-end" }}>
            <Btn onClick={()=>setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSave} icon="save">Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// PAYMENTS
// ════════════════════════════════════════════════════════════════════════════
function Payments({ payments, clients, orders, invoices, onSave, onDelete, preSelectedClient }) {
  const [modal, setModal]     = useState(!!preSelectedClient);
  const [form, setForm]       = useState({ clienteId: preSelectedClient||"", data: new Date().toISOString().split("T")[0], valor:"", referencia:"", metodo:"Transferência", notas:"", faturaId:"" });
  const [filterClient, setFilterClient] = useState(preSelectedClient||"all");

  const openNew = (cid) => {
    setForm({ clienteId:cid||"", data:new Date().toISOString().split("T")[0], valor:"", referencia:"", metodo:"Transferência", notas:"", faturaId:"" });
    setModal(true);
  };
  const handleSave = () => {
    if (!form.clienteId || !form.valor) return;
    onSave({ ...form, id:genId(), clienteId:parseInt(form.clienteId), valor:parseFloat(form.valor), faturaId: form.faturaId||null });
    setModal(false);
  };

  const globalSaldos  = clients.map(c => ({ ...c, ...calcSaldo(c.id, orders, payments) }));
  const totalDivida   = globalSaldos.filter(c => c.saldo < -0.01).reduce((s,c) => s + Math.abs(c.saldo), 0);
  const totalRecebido = payments.reduce((s,p) => s + p.valor, 0);

  const filtered = (filterClient === "all"
    ? payments
    : payments.filter(p => p.clienteId === parseInt(filterClient))
  ).sort((a,b) => new Date(b.data) - new Date(a.data));

  // Faturas do cliente seleccionado no modal (apenas pos-pago)
  const clienteSelObj   = clients.find(c => c.id === parseInt(form.clienteId));
  const isPosModal      = clienteSelObj?.tipo === "pos-pago" || (!clienteSelObj?.tipo);
  const faturasCliente  = (invoices||[]).filter(i => i.clienteId === parseInt(form.clienteId));

  // Calcular quanto já foi pago por fatura
  const calcFaturaPago = (faturaId) =>
    payments.filter(p => p.faturaId === faturaId).reduce((s,p) => s + p.valor, 0);

  const faturasComSaldo = faturasCliente.map(inv => {
    const pago   = calcFaturaPago(inv.id);
    const divida = inv.total - pago;
    return { ...inv, pago, divida };
  }).filter(f => f.divida > 0.01); // só faturas com saldo em aberto

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" }}>
        <div>
          <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.25rem", margin:"0 0 0.25rem", fontWeight:700, letterSpacing:"-0.025em" }}>Pagamentos</h2>
          <p style={{ color:"#475569", fontSize:"0.8rem", margin:0 }}>Controlo de saldos e recebimentos</p>
        </div>
        <Btn onClick={() => openNew()} icon="plus">Registar Pagamento</Btn>
      </div>

      {/* ── Secção 1: Saldos dos Clientes ─────────────────────────────────── */}
      <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden", marginBottom:"1.5rem" }}>
        <div style={{ padding:"1rem 1.4rem", borderBottom:C.border, display:"flex", justifyContent:"space-between", alignItems:"center" }}>
          <h4 style={{ color:"#e2e8f0", margin:0, fontSize:"0.88rem", fontWeight:600, letterSpacing:"-0.01em" }}>Saldo por Cliente</h4>
          <span style={{ color:"#475569", fontSize:"0.8rem" }}>
            Total em dívida: <strong style={{ color:"#ef4444" }}>{fmt(totalDivida)} MT</strong>
            {" · "}
            Total recebido: <strong style={{ color:"#10b981" }}>{fmt(totalRecebido)} MT</strong>
          </span>
        </div>

        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.85rem" }}>
          <thead>
            <tr>
              {["Cliente","Tipo","Total Faturado","Total Pago","Saldo",""].map((h,i) => (
                <th key={i} style={{ padding:"0.7rem 1.1rem", textAlign: i>=2?"right":"left", color:"#334155", fontWeight:600, fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.1em", borderBottom:C.borderFaint, background:"rgba(0,0,0,0.2)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {globalSaldos.map(c => {
              const isPre    = c.tipo === "pre-pago";
              const devedor  = c.saldo < -0.01;
              const credito  = c.saldo >  0.01;
              const saldoColor = isPre
                ? (devedor ? "#ef4444" : credito ? "#3b82f6" : "#64748b")
                : (devedor ? "#ef4444" : credito ? "#10b981" : "#64748b");
              const saldoLabel = isPre
                ? (devedor ? "⚠ Limite excedido" : credito ? "✓ Disponível" : "Sem saldo")
                : (devedor ? "⚠ Em dívida"       : credito ? "✓ Crédito"    : "✓ Liquidado");
              return (
                <tr key={c.id} style={{ borderBottom:"1px solid #0d2137" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(30,58,95,0.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding:"0.85rem 1.2rem" }}>
                    <div style={{ color:"#f1f5f9", fontWeight:600 }}>{c.nome.split(",")[0]}</div>
                    {c.nif && <div style={{ color:"#475569", fontSize:"0.72rem" }}>NIF: {c.nif}</div>}
                  </td>
                  <td style={{ padding:"0.85rem 1.2rem" }}><TipoBadge tipo={c.tipo||"pos-pago"}/></td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right", color:"#cbd5e1" }}>
                    {isPre ? "—" : `${fmt(c.faturado)} MT`}
                  </td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right", color: isPre?"#3b82f6":"#10b981", fontWeight:600 }}>
                    {fmt(c.pago)} MT
                  </td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right" }}>
                    <span style={{ color:saldoColor, fontWeight:700, fontSize:"1rem" }}>
                      {devedor ? "−" : credito ? "+" : ""}{fmt(Math.abs(c.saldo))} MT
                    </span>
                    <div style={{ fontSize:"0.7rem", color:saldoColor, marginTop:"2px" }}>{saldoLabel}</div>
                  </td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right" }}>
                    <button onClick={() => openNew(c.id)}
                      style={{ padding:"5px 14px", background: isPre?"rgba(59,130,246,0.1)":"rgba(16,185,129,0.1)", border: isPre?"1px solid rgba(59,130,246,0.3)":"1px solid rgba(16,185,129,0.3)", borderRadius:"7px", color: isPre?"#3b82f6":"#10b981", cursor:"pointer", fontSize:"0.78rem", fontWeight:600, whiteSpace:"nowrap" }}>
                      {isPre ? "⬆ Carregar" : "+ Pagamento"}
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Secção 2: Histórico de Pagamentos ────────────────────────────── */}
      <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden" }}>
        <div style={{ padding:"1rem 1.4rem", borderBottom:C.border, display:"flex", justifyContent:"space-between", alignItems:"center", gap:"1rem", flexWrap:"wrap" }}>
          <h4 style={{ color:"#e2e8f0", margin:0, fontSize:"0.88rem", fontWeight:600, letterSpacing:"-0.01em" }}>Histórico de Pagamentos</h4>
          <Select value={filterClient} onChange={e => setFilterClient(e.target.value)} style={{ maxWidth:"220px", padding:"0.4rem 0.8rem" }}>
            <option value="all">Todos os clientes</option>
            {clients.map(c => <option key={c.id} value={c.id}>{c.nome.split(",")[0]}</option>)}
          </Select>
        </div>

        <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.85rem" }}>
          <thead>
            <tr>
              {["Data","Cliente","Fatura","Referência","Método","Valor",""].map((h,i) => (
                <th key={i} style={{ padding:"0.65rem 1.2rem", textAlign: i===5?"right":"left", color:"#334155", fontWeight:600, fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.1em", borderBottom:C.borderFaint, background:"rgba(0,0,0,0.2)", whiteSpace:"nowrap" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => {
              const c   = clients.find(x => x.id === p.clienteId);
              const inv = (invoices||[]).find(x => x.id === p.faturaId);
              return (
                <tr key={p.id} style={{ borderBottom:"1px solid #0d2137" }}
                  onMouseEnter={e => e.currentTarget.style.background = "rgba(30,58,95,0.2)"}
                  onMouseLeave={e => e.currentTarget.style.background = "transparent"}>
                  <td style={{ padding:"0.85rem 1.2rem", color:"#475569", whiteSpace:"nowrap" }}>{fmtDate(p.data)}</td>
                  <td style={{ padding:"0.85rem 1.2rem", color:"#f1f5f9", fontWeight:600 }}>{c?.nome?.split(",")[0] || "—"}</td>
                  <td style={{ padding:"0.85rem 1.2rem" }}>
                    {inv
                      ? <span style={{ padding:"2px 9px", borderRadius:"20px", fontSize:"0.7rem", fontWeight:700, background:"rgba(139,92,246,0.1)", color:"#8b5cf6", border:"1px solid rgba(139,92,246,0.25)" }}>{inv.numero}</span>
                      : <span style={{ color:"#475569", fontSize:"0.78rem" }}>—</span>
                    }
                  </td>
                  <td style={{ padding:"0.85rem 1.2rem", color:"#94a3b8" }}>{p.referencia || "—"}</td>
                  <td style={{ padding:"0.85rem 1.2rem", color:"#475569" }}>{p.metodo}</td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right", color:"#10b981", fontWeight:700, whiteSpace:"nowrap" }}>+{fmt(p.valor)} MT</td>
                  <td style={{ padding:"0.85rem 1.2rem", textAlign:"right" }}>
                    <button onClick={() => onDelete(p.id)}
                      style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:"6px", color:"#ef4444", cursor:"pointer", padding:"5px", display:"flex" }}>
                      <Icon name="trash" size={13}/>
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>

        {filtered.length === 0 && (
          <div style={{ textAlign:"center", padding:"3rem", color:"#475569" }}>
            <Icon name="wallet" size={28}/>
            <p style={{ marginTop:"0.8rem", margin:"0.8rem 0 0" }}>Nenhum pagamento encontrado.</p>
          </div>
        )}
      </div>

      {/* ── Modal: Registar Pagamento ─────────────────────────────────────── */}
      {modal && (
        <Modal title="Registar Pagamento" onClose={() => setModal(false)}>
          <Field label="Cliente *">
            <Select value={form.clienteId} onChange={e => setForm({...form, clienteId:e.target.value, faturaId:"", valor:""})}>
              <option value="">— Seleccionar Cliente —</option>
              {clients.map(c => {
                const { saldo } = calcSaldo(c.id, orders, payments);
                const label = saldo < -0.01 ? ` — deve ${fmt(Math.abs(saldo))} MT` : saldo > 0.01 ? ` — crédito ${fmt(saldo)} MT` : "";
                return <option key={c.id} value={c.id}>{c.nome.split(",")[0]}{label}</option>;
              })}
            </Select>
          </Field>

          {/* Resumo do cliente seleccionado */}
          {form.clienteId && (() => {
            const { faturado, pago, saldo } = calcSaldo(parseInt(form.clienteId), orders, payments);
            const devedor = saldo < -0.01;
            const credito = saldo > 0.01;
            return (
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:"0.6rem", marginBottom:"1.2rem" }}>
                {[
                  ["Faturado",  fmt(faturado)+" MT", "#f59e0b"],
                  ["Já pago",   fmt(pago)+" MT",     "#10b981"],
                  ["Saldo",     (devedor?"−":credito?"+":"")+fmt(Math.abs(saldo))+" MT", devedor?"#ef4444":credito?"#10b981":"#64748b"]
                ].map(([l,v,col]) => (
                  <div key={l} style={{ background:C.bgDeep, border:C.border, borderRadius:"8px", padding:"0.7rem 0.9rem", textAlign:"center" }}>
                    <div style={{ color:"#475569", fontSize:"0.68rem", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"4px" }}>{l}</div>
                    <div style={{ color:col, fontWeight:700, fontSize:"0.95rem" }}>{v}</div>
                  </div>
                ))}
              </div>
            );
          })()}

          {/* ── Selector de Fatura (apenas pós-pago) ── */}
          {form.clienteId && isPosModal && (
            <div style={{ marginBottom:"1rem" }}>
              <label style={{ display:"block", color:"#94a3b8", fontSize:"0.75rem", marginBottom:"6px", textTransform:"uppercase", letterSpacing:"0.08em" }}>
                Fatura a Pagar (opcional)
              </label>

              {faturasComSaldo.length === 0 ? (
                <div style={{ background:C.bgDeep, border:"1px dashed #1e3a5f", borderRadius:"10px", padding:"1rem", textAlign:"center", color:"#475569", fontSize:"0.82rem" }}>
                  Sem faturas em aberto para este cliente
                </div>
              ) : (
                <div style={{ display:"flex", flexDirection:"column", gap:"0.5rem" }}>
                  {/* Opção: sem fatura específica */}
                  <div onClick={() => setForm({...form, faturaId:"", valor:""})}
                    style={{ padding:"0.7rem 1rem", borderRadius:"10px", cursor:"pointer", border:`2px solid ${!form.faturaId ? "#f59e0b" : "#1e3a5f"}`, background: !form.faturaId ? "rgba(245,158,11,0.06)" : C.bgDeep, display:"flex", alignItems:"center", gap:"10px", transition:"all 0.2s" }}>
                    <div style={{ width:"16px", height:"16px", borderRadius:"50%", border:`2px solid ${!form.faturaId ? "#f59e0b" : "#475569"}`, background: !form.faturaId ? "#f59e0b" : "transparent", flexShrink:0 }}/>
                    <div style={{ fontSize:"0.82rem", color: !form.faturaId ? "#f59e0b" : "#94a3b8" }}>Pagamento geral (sem fatura específica)</div>
                  </div>

                  {/* Uma linha por fatura em aberto */}
                  {faturasComSaldo.map(inv => {
                    const fmtP = (p) => new Date(p + "-01").toLocaleDateString("pt-MZ", { month:"short", year:"numeric" });
                    const selected = form.faturaId === inv.id;
                    return (
                      <div key={inv.id}
                        onClick={() => setForm({...form, faturaId:inv.id, valor:String(inv.divida.toFixed(2))})}
                        style={{ padding:"0.8rem 1rem", borderRadius:"10px", cursor:"pointer", border:`2px solid ${selected ? "#8b5cf6" : "#1e3a5f"}`, background: selected ? "rgba(139,92,246,0.08)" : C.bgDeep, transition:"all 0.2s" }}>
                        <div style={{ display:"flex", alignItems:"center", gap:"10px" }}>
                          <div style={{ width:"16px", height:"16px", borderRadius:"50%", border:`2px solid ${selected ? "#8b5cf6" : "#475569"}`, background: selected ? "#8b5cf6" : "transparent", flexShrink:0 }}/>
                          <div style={{ flex:1 }}>
                            <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                              <div style={{ display:"flex", alignItems:"center", gap:"8px" }}>
                                <span style={{ color: selected ? "#a78bfa" : "#f1f5f9", fontWeight:700, fontSize:"0.85rem" }}>{inv.numero}</span>
                                <span style={{ color:"#475569", fontSize:"0.75rem" }}>· {fmtP(inv.periodo)}</span>
                              </div>
                              <div style={{ textAlign:"right" }}>
                                <div style={{ color:"#ef4444", fontWeight:700, fontSize:"0.88rem" }}>Em aberto: {fmt(inv.divida)} MT</div>
                                {inv.pago > 0 && <div style={{ color:"#10b981", fontSize:"0.72rem" }}>Pago: {fmt(inv.pago)} MT</div>}
                              </div>
                            </div>
                            <div style={{ marginTop:"4px" }}>
                              <div style={{ height:"4px", background:"#1e3a5f", borderRadius:"2px", overflow:"hidden" }}>
                                <div style={{ height:"100%", width:`${(inv.pago/inv.total)*100}%`, background:"#10b981", borderRadius:"2px" }}/>
                              </div>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1rem" }}>
            <Field label="Data *"><Input type="date" value={form.data} onChange={e=>setForm({...form,data:e.target.value})}/></Field>
            <Field label="Valor (MT) *">
              <Input type="number" step="0.01" value={form.valor} onChange={e=>setForm({...form,valor:e.target.value})} placeholder="0.00"/>
              {form.faturaId && <div style={{ color:"#8b5cf6", fontSize:"0.72rem", marginTop:"3px" }}>↑ Preenchido automaticamente com o valor em aberto</div>}
            </Field>
            <Field label="Referência"><Input value={form.referencia} onChange={e=>setForm({...form,referencia:e.target.value})} placeholder="TRF-2024-001"/></Field>
            <Field label="Método">
              <Select value={form.metodo} onChange={e=>setForm({...form,metodo:e.target.value})}>
                <option>Transferência</option><option>Cheque</option><option>Numerário</option><option>Débito Directo</option><option>Outro</option>
              </Select>
            </Field>
          </div>
          <Field label="Notas"><Input value={form.notas} onChange={e=>setForm({...form,notas:e.target.value})} placeholder="Observações opcionais..."/></Field>

          <div style={{ display:"flex", gap:"0.8rem", justifyContent:"flex-end" }}>
            <Btn onClick={() => setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSave} icon="save" disabled={!form.clienteId || !form.valor}>Confirmar Pagamento</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}



// ════════════════════════════════════════════════════════════════════════════
// PRODUCTS
// ════════════════════════════════════════════════════════════════════════════
function Products({ products, onSave, onDelete, priceHistory, onPriceChange }) {
  const [modal, setModal]   = useState(null);
  const [form, setForm]     = useState({});
  const [motivo, setMotivo] = useState("");
  const [tab, setTab]       = useState("produtos");
  const [filterProd, setFilterProd] = useState("all");

  const openNew   = () => { setForm({nome:"",unidade:"L",preco:"",cor:"#f59e0b"}); setMotivo(""); setModal("produto"); };
  const openEdit  = (p) => { setForm({...p}); setMotivo(""); setModal("produto"); };
  const openPrice = (p) => { setForm({...p,precoNovo:p.preco}); setMotivo(""); setModal("preco"); };

  const handleSaveProduto = () => {
    if(!form.nome) return;
    const old=products.find(x=>x.id===form.id);
    const novoPreco=parseFloat(form.preco)||0;
    if(old&&old.preco!==novoPreco&&novoPreco>0) onPriceChange({id:genId(),produtoId:form.id,produtoNome:form.nome,precoAnterior:old.preco,precoNovo:novoPreco,data:new Date().toISOString().split("T")[0],motivo:motivo||"Actualização"});
    onSave({...form,id:form.id||genId(),preco:novoPreco});
    setModal(null);
  };

  const handleSavePreco = () => {
    const novoPreco=parseFloat(form.precoNovo)||0;
    if(!novoPreco||novoPreco===form.preco){setModal(null);return;}
    onPriceChange({id:genId(),produtoId:form.id,produtoNome:form.nome,precoAnterior:form.preco,precoNovo:novoPreco,data:new Date().toISOString().split("T")[0],motivo:motivo||"Revisão de mercado"});
    onSave({...form,preco:novoPreco});
    setModal(null);
  };

  const CORES=["#f59e0b","#3b82f6","#8b5cf6","#10b981","#ef4444","#ec4899","#06b6d4","#6b7280"];
  const filteredHistory=(filterProd==="all"?priceHistory:priceHistory.filter(h=>h.produtoId===parseInt(filterProd))).sort((a,b)=>new Date(b.data)-new Date(a.data));

  return (
    <div>
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" }}>
        <div>
          <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.25rem", margin:"0 0 0.25rem", fontWeight:700, letterSpacing:"-0.025em" }}>Produtos & Preços</h2>
          <p style={{ color:"#475569", fontSize:"0.8rem", margin:0 }}>Gerir produtos, preços e histórico</p>
        </div>
        {tab==="produtos"&&<Btn onClick={openNew} icon="plus">Novo Produto</Btn>}
      </div>

      <div style={{ display:"flex", gap:"4px", background:"#0a1220", borderRadius:"10px", padding:"4px", marginBottom:"1.5rem", width:"fit-content", border:C.border }}>
        {[{id:"produtos",label:"Produtos",icon:"products"},{id:"historico",label:"Histórico de Preços",icon:"history"}].map(t=>(
          <button key={t.id} onClick={()=>setTab(t.id)} style={{ display:"flex", alignItems:"center", gap:"7px", padding:"0.5rem 1.1rem", borderRadius:"7px", border:"none", cursor:"pointer", fontWeight:600, fontSize:"0.82rem", background: tab===t.id?"rgba(245,158,11,0.15)":"transparent", color: tab===t.id?"#f59e0b":"#64748b" }}>
            <Icon name={t.icon} size={14}/>{t.label}
          </button>
        ))}
      </div>

      {tab==="produtos"&&(
        <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden" }}>
          <Table headers={["Produto","Unidade","Preço Actual","Cor","Ações"]}>
            {products.map(p=>(
              <TR key={p.id}>
                <TD><div style={{display:"flex",alignItems:"center",gap:"10px"}}><div style={{width:"10px",height:"10px",borderRadius:"50%",background:p.cor}}/><span style={{color:"#f1f5f9",fontWeight:600}}>{p.nome}</span></div></TD>
                <TD muted>{p.unidade}</TD>
                <TD bold right><span style={{color:"#f59e0b"}}>{p.preco>0?`${fmt(p.preco)} MT/${p.unidade}`:"Variável"}</span></TD>
                <TD><div style={{width:"24px",height:"24px",borderRadius:"6px",background:p.cor}}/></TD>
                <TD><div style={{display:"flex",gap:"6px"}}>
                  <Btn onClick={()=>openPrice(p)} variant="ghost" small icon="tag">Alterar Preço</Btn>
                  <Btn onClick={()=>openEdit(p)} variant="secondary" small icon="edit">Editar</Btn>
                  <Btn onClick={()=>onDelete(p.id)} variant="danger" small icon="trash"/>
                </div></TD>
              </TR>
            ))}
          </Table>
        </div>
      )}

      {tab==="historico"&&(
        <div>
          <div style={{ background:C.bg, border:C.border, borderRadius:"14px", padding:"1rem 1.2rem", marginBottom:"1rem", display:"flex", alignItems:"center", gap:"1rem" }}>
            <Select value={filterProd} onChange={e=>setFilterProd(e.target.value)} style={{maxWidth:"220px"}}>
              <option value="all">Todos os produtos</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.nome}</option>)}
            </Select>
            <span style={{color:"#475569",fontSize:"0.8rem",marginLeft:"auto"}}>{filteredHistory.length} alterações</span>
          </div>
          {filteredHistory.length===0?(
            <div style={{background:C.bg,border:C.border,borderRadius:"14px",padding:"3rem",textAlign:"center",color:"#475569"}}>
              <Icon name="history" size={32}/><p style={{marginTop:"1rem"}}>Nenhuma alteração registada ainda.</p>
            </div>
          ):(
            <div style={{position:"relative"}}>
              <div style={{position:"absolute",left:"24px",top:"24px",bottom:"24px",width:"2px",background:"#1e3a5f",zIndex:0}}/>
              {filteredHistory.map(h=>{
                const prod=products.find(p=>p.id===h.produtoId);
                const subida=h.precoNovo>h.precoAnterior;
                const pct=h.precoAnterior?((h.precoNovo-h.precoAnterior)/h.precoAnterior*100).toFixed(1):0;
                return (
                  <div key={h.id} style={{display:"flex",gap:"1.2rem",alignItems:"flex-start",padding:"0.8rem 0",position:"relative",zIndex:1}}>
                    <div style={{width:"50px",flexShrink:0,display:"flex",justifyContent:"center",paddingTop:"12px"}}>
                      <div style={{width:"12px",height:"12px",borderRadius:"50%",background:prod?.cor||"#f59e0b",border:"2px solid #070d18"}}/>
                    </div>
                    <div style={{flex:1,background:C.bg,border:C.border,borderRadius:"12px",padding:"1rem 1.2rem",marginBottom:"4px"}}>
                      <div style={{display:"flex",justifyContent:"space-between",marginBottom:"0.6rem"}}>
                        <span style={{color:"#f1f5f9",fontWeight:700}}>{h.produtoNome}</span>
                        <span style={{color:"#475569",fontSize:"0.75rem"}}>{fmtDate(h.data)}</span>
                      </div>
                      <div style={{display:"flex",alignItems:"center",gap:"1rem",flexWrap:"wrap"}}>
                        <div style={{background:C.bgDeep,borderRadius:"8px",padding:"0.5rem 0.9rem"}}>
                          <div style={{color:"#475569",fontSize:"0.68rem",textTransform:"uppercase"}}>Anterior</div>
                          <div style={{color:"#94a3b8",fontWeight:600}}>{fmt(h.precoAnterior)} MT</div>
                        </div>
                        <span style={{color:"#475569"}}>→</span>
                        <div style={{background:subida?"rgba(239,68,68,0.08)":"rgba(16,185,129,0.08)",border:`1px solid ${subida?"rgba(239,68,68,0.2)":"rgba(16,185,129,0.2)"}`,borderRadius:"8px",padding:"0.5rem 0.9rem"}}>
                          <div style={{color:"#475569",fontSize:"0.68rem",textTransform:"uppercase"}}>Novo</div>
                          <div style={{color:subida?"#ef4444":"#10b981",fontWeight:700}}>{fmt(h.precoNovo)} MT</div>
                        </div>
                        <div style={{padding:"0.4rem 0.8rem",borderRadius:"20px",background:subida?"rgba(239,68,68,0.1)":"rgba(16,185,129,0.1)",color:subida?"#ef4444":"#10b981",fontSize:"0.78rem",fontWeight:700}}>
                          {subida?"▲":"▼"} {Math.abs(pct)}%
                        </div>
                      </div>
                      {h.motivo&&<div style={{marginTop:"0.6rem",color:"#475569",fontSize:"0.78rem"}}><span style={{color:"#475569"}}>Motivo:</span> {h.motivo}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modal==="preco"&&(
        <Modal title={`Alterar Preço — ${form.nome}`} onClose={()=>setModal(null)}>
          <div style={{background:C.bgDeep,borderRadius:"10px",padding:"1rem",marginBottom:"1.2rem",display:"flex",justifyContent:"space-between",alignItems:"center"}}>
            <div><div style={{color:"#475569",fontSize:"0.75rem",marginBottom:"3px"}}>Preço Actual</div><div style={{color:"#f1f5f9",fontSize:"1.4rem",fontWeight:700}}>{fmt(form.preco)} MT</div></div>
            <Icon name="arrow" size={24}/>
            <div><div style={{color:"#475569",fontSize:"0.75rem",marginBottom:"3px"}}>Novo Preço</div><div style={{color:parseFloat(form.precoNovo)>form.preco?"#ef4444":"#10b981",fontSize:"1.4rem",fontWeight:700}}>{fmt(form.precoNovo||0)} MT</div></div>
          </div>
          <Field label="Novo Preço (MT) *"><Input type="number" step="0.01" value={form.precoNovo||""} onChange={e=>setForm({...form,precoNovo:e.target.value})} autoFocus/></Field>
          <Field label="Motivo"><Input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Ex: Revisão INATTER, aumento do mercado..."/></Field>
          <div style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:"8px",padding:"0.8rem 1rem",marginBottom:"1rem",fontSize:"0.8rem",color:"#94a3b8"}}>
            ⚠️ <strong style={{color:"#f59e0b"}}>Pedidos anteriores não são afectados.</strong> O novo preço aplica-se apenas a novos pedidos.
          </div>
          <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end"}}>
            <Btn onClick={()=>setModal(null)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSavePreco} icon="save">Confirmar</Btn>
          </div>
        </Modal>
      )}

      {modal==="produto"&&(
        <Modal title={form.id?"Editar Produto":"Novo Produto"} onClose={()=>setModal(null)}>
          <Field label="Nome *"><Input value={form.nome||""} onChange={e=>setForm({...form,nome:e.target.value})} placeholder="Ex: Gasolina, Diesel..."/></Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <Field label="Unidade">
              <Select value={form.unidade||"L"} onChange={e=>setForm({...form,unidade:e.target.value})}>
                <option value="L">Litro (L)</option><option value="kg">Quilograma (kg)</option><option value="un">Unidade (un)</option><option value="cx">Caixa (cx)</option>
              </Select>
            </Field>
            <Field label="Preço (MT)"><Input type="number" step="0.01" value={form.preco||""} onChange={e=>setForm({...form,preco:e.target.value})} placeholder="0.00"/></Field>
          </div>
          {form.id&&<Field label="Motivo (se preço mudou)"><Input value={motivo} onChange={e=>setMotivo(e.target.value)} placeholder="Opcional..."/></Field>}
          <Field label="Cor Identificativa">
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              {CORES.map(c=><div key={c} onClick={()=>setForm({...form,cor:c})} style={{width:"32px",height:"32px",borderRadius:"8px",background:c,cursor:"pointer",border:form.cor===c?"3px solid #fff":"3px solid transparent"}}/>)}
            </div>
          </Field>
          <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end"}}>
            <Btn onClick={()=>setModal(null)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSaveProduto} icon="save">Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// EXCEL IMPORT MODAL
// ════════════════════════════════════════════════════════════════════════════
function ExcelImportModal({ clients, products, onImport, onClose }) {
  const [step, setStep]           = useState("upload");
  const [rawRows, setRawRows]     = useState([]);
  const [headers, setHeaders]     = useState([]);
  const [mapping, setMapping]     = useState({});
  const [preview, setPreview]     = useState([]);
  const [errors, setErrors]       = useState([]);
  const [aiMsg, setAiMsg]         = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [done, setDone]           = useState(0);

  const FIELDS = [
    { key:"data",      label:"Data",          required:true  },
    { key:"reqNum",    label:"Nº Requisição",  required:false },
    { key:"cliente",   label:"Cliente",        required:true  },
    { key:"produto",   label:"Produto",        required:true  },
    { key:"qtd",       label:"Quantidade",     required:true  },
    { key:"valorUnit", label:"Preço Unitário", required:false },
    { key:"total",     label:"Total",          required:false },
  ];

  const autoDetect = (hdrs) => {
    const n = h => (h||"").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"");
    const map = {};
    hdrs.forEach(h => {
      const l = n(h);
      if (!map.data      && (l.includes("data") || l.includes("date")))                                              map.data      = h;
      if (!map.reqNum    && (l.includes("req")  || l.includes("num")  || l==="n"))                                  map.reqNum    = h;
      if (!map.cliente   && (l.includes("cliente") || l.includes("client")))                                        map.cliente   = h;
      if (!map.produto   && (l.includes("produto") || l.includes("product") || l.includes("combustivel")))          map.produto   = h;
      if (!map.qtd       && (l.includes("qtd") || l.includes("quant") || l.includes("litro") || l==="l"))          map.qtd       = h;
      if (!map.valorUnit && (l.includes("unit") || l.includes("preco unit") || l.includes("valor unit")))           map.valorUnit = h;
      if (!map.total     && (l.includes("total") || l.includes("amount")))                                          map.total     = h;
    });
    return map;
  };

  const handleFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    try {
      const XLSX = await import("https://cdn.sheetjs.com/xlsx-0.20.1/package/xlsx.mjs");
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(buf);
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { header:1, defval:"" });
      if (rows.length < 2) { alert("Ficheiro vazio ou sem dados."); return; }
      const hdrs = rows[0].map(String);
      const data = rows.slice(1).filter(r => r.some(c => c !== ""));
      setHeaders(hdrs);
      setRawRows(data);
      setMapping(autoDetect(hdrs));
      setStep("mapping");
    } catch(err) {
      alert("Erro ao ler o ficheiro. Certifica-te que é um ficheiro Excel válido.");
    }
  };

  const askAI = async () => {
    setAiLoading(true); setAiMsg("");
    try {
      const sample = rawRows.slice(0,3).map(r => {
        const obj = {}; headers.forEach((h,i) => obj[h] = r[i]); return obj;
      });
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body: JSON.stringify({
          model:"claude-sonnet-4-20250514", max_tokens:600,
          messages:[{role:"user",content:`Tens um Excel com colunas: ${JSON.stringify(headers)}\nExemplo de dados: ${JSON.stringify(sample)}\nMapeamento actual: ${JSON.stringify(mapping)}\n\nOs campos necessários são: data, reqNum (nº requisição), cliente, produto, qtd (quantidade), valorUnit (preço unitário), total.\n\nAnalisa e diz em português:\n1. Se o mapeamento está correcto\n2. O que fazer com colunas não mapeadas\n3. Problemas nos dados\nSê conciso e prático.`}]
        })
      });
      const d = await res.json();
      setAiMsg(d.content?.[0]?.text || "Sem resposta.");
    } catch(e) { setAiMsg("Erro ao contactar a IA. Verifica o mapeamento manualmente."); }
    setAiLoading(false);
  };

  const parseDate = (val) => {
    if (!val) return null;
    if (typeof val === "number") {
      const d = new Date((val - 25569) * 86400 * 1000);
      return d.toISOString().split("T")[0];
    }
    const s = String(val).trim();
    const pt = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
    if (pt) { const y = pt[3].length===2?"20"+pt[3]:pt[3]; return `${y}-${pt[2].padStart(2,"0")}-${pt[1].padStart(2,"0")}`; }
    return s;
  };

  const buildPreview = () => {
    const errs = [];
    const rows = rawRows.map((row, i) => {
      const get = (field) => { const col=mapping[field]; if(!col) return ""; const idx=headers.indexOf(col); return idx>=0?row[idx]:""; };
      const dataStr    = parseDate(get("data"));
      const clienteStr = String(get("cliente")||"").trim();
      const produtoStr = String(get("produto")||"").trim();
      const qtdVal     = parseFloat(String(get("qtd")).replace(",","."))||0;
      const vuVal      = parseFloat(String(get("valorUnit")).replace(",","."))||0;
      const totalVal   = parseFloat(String(get("total")).replace(",","."))||0;
      const reqNum     = String(get("reqNum")||"").trim();
      const cliente    = clients.find(c => c.nome.toLowerCase().includes(clienteStr.toLowerCase()) || clienteStr.toLowerCase().includes(c.nome.split(",")[0].toLowerCase()));
      const produto    = products.find(p => p.nome.toLowerCase().includes(produtoStr.toLowerCase()) || produtoStr.toLowerCase().includes(p.nome.toLowerCase()));
      const rowErrs    = [];
      if (!dataStr)    rowErrs.push("data inválida");
      if (!cliente)    rowErrs.push(`cliente "${clienteStr}" não encontrado`);
      if (!produto)    rowErrs.push(`produto "${produtoStr}" não encontrado`);
      if (qtdVal <= 0) rowErrs.push("quantidade inválida");
      if (rowErrs.length) errs.push(`Linha ${i+2}: ${rowErrs.join(", ")}`);
      const calcTotal  = qtdVal*vuVal||totalVal;
      return { _row:i, _ok:rowErrs.length===0, _errs:rowErrs, data:dataStr, reqNum, clienteStr, produtoStr, clienteId:cliente?.id, produtoId:produto?.id, qtd:qtdVal, valorUnit:vuVal||(calcTotal/qtdVal)||0, total:calcTotal };
    });
    setPreview(rows); setErrors(errs); setStep("preview");
  };

  const doImport = async () => {
    setImporting(true);
    const valid = preview.filter(r => r._ok);
    for (let i = 0; i < valid.length; i++) {
      const r = valid[i];
      await onImport({ id:genId(), data:r.data, reqNum:r.reqNum, clienteId:r.clienteId, produtoId:r.produtoId, qtd:r.qtd, valorUnit:r.valorUnit, total:r.total });
      setDone(i+1);
    }
    setImporting(false); setStep("done");
  };

  const okCount = preview.filter(r=>r._ok).length;
  const badCount = preview.filter(r=>!r._ok).length;

  return (
    <Modal title="Importar Pedidos do Excel" onClose={onClose} wide>
      <div style={{position:"relative"}}>

        {/* UPLOAD */}
        {step==="upload" && (
          <div style={{textAlign:"center",padding:"2.5rem 1rem"}}>
            <div style={{fontSize:"3.5rem",marginBottom:"1rem"}}>📊</div>
            <div style={{color:"#f1f5f9",fontWeight:700,fontSize:"1.05rem",marginBottom:"0.4rem"}}>Importar ficheiro Excel</div>
            <div style={{color:"#475569",fontSize:"0.82rem",marginBottom:"2rem"}}>Formatos suportados: .xlsx, .xls, .csv</div>
            <label style={{display:"inline-block",padding:"0.75rem 1.8rem",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#000",borderRadius:"12px",cursor:"pointer",fontWeight:700,fontSize:"0.88rem",boxShadow:"0 4px 16px rgba(245,158,11,0.3)"}}>
              📂 Escolher ficheiro
              <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFile} style={{display:"none"}}/>
            </label>
            <div style={{marginTop:"2rem",padding:"1rem 1.2rem",background:C.bgDeep,borderRadius:"12px",border:C.border,textAlign:"left"}}>
              <div style={{color:"#475569",fontSize:"0.72rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.6rem"}}>O ficheiro deve ter colunas como:</div>
              <div style={{color:"#64748b",fontSize:"0.8rem",lineHeight:2}}>
                📅 Data &nbsp;·&nbsp; 🔢 Nº Requisição &nbsp;·&nbsp; 👤 Cliente &nbsp;·&nbsp; ⛽ Produto &nbsp;·&nbsp; 📦 Quantidade &nbsp;·&nbsp; 💰 Preço Unitário &nbsp;·&nbsp; 💵 Total
              </div>
            </div>
          </div>
        )}

        {/* MAPPING */}
        {step==="mapping" && (
          <div>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.8rem 1rem",background:"rgba(245,158,11,0.07)",border:"1px solid rgba(245,158,11,0.18)",borderRadius:"10px",marginBottom:"1.2rem"}}>
              <div style={{color:"#fbbf24",fontSize:"0.82rem"}}>✓ <strong>{rawRows.length} linhas</strong> · <strong>{headers.length} colunas</strong> detectadas</div>
              <button onClick={askAI} disabled={aiLoading} style={{background:"linear-gradient(135deg,#8b5cf6,#7c3aed)",color:"#fff",border:"none",borderRadius:"8px",padding:"0.42rem 1rem",cursor:aiLoading?"wait":"pointer",fontSize:"0.78rem",fontWeight:600,display:"flex",alignItems:"center",gap:"6px",opacity:aiLoading?0.7:1}}>
                {aiLoading?"⏳ A analisar...":"✨ Analisar com IA"}
              </button>
            </div>

            {aiMsg && (
              <div style={{marginBottom:"1.2rem",padding:"1rem 1.2rem",background:"rgba(139,92,246,0.07)",border:"1px solid rgba(139,92,246,0.18)",borderRadius:"10px"}}>
                <div style={{color:"#a78bfa",fontSize:"0.68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.5rem"}}>✨ Análise da IA</div>
                <div style={{color:"#c4b5fd",fontSize:"0.82rem",lineHeight:1.8,whiteSpace:"pre-wrap"}}>{aiMsg}</div>
              </div>
            )}

            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.8rem",marginBottom:"1.2rem"}}>
              {FIELDS.map(f => (
                <Field key={f.key} label={`${f.label}${f.required?" *":""}`}>
                  <Select value={mapping[f.key]||""} onChange={e=>setMapping(m=>({...m,[f.key]:e.target.value}))}>
                    <option value="">— Ignorar —</option>
                    {headers.map(h=><option key={h} value={h}>{h}</option>)}
                  </Select>
                </Field>
              ))}
            </div>

            <div style={{background:C.bgDeep,borderRadius:"10px",padding:"0.8rem 1rem",marginBottom:"1.2rem",border:C.border,overflowX:"auto"}}>
              <div style={{color:"#334155",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.6rem"}}>Primeiras 3 linhas do ficheiro</div>
              <table style={{borderCollapse:"collapse",fontSize:"0.75rem",width:"100%"}}>
                <thead>
                  <tr>{headers.map(h=><th key={h} style={{color:"#334155",padding:"4px 8px",textAlign:"left",whiteSpace:"nowrap",borderBottom:C.borderFaint}}>{h}</th>)}</tr>
                </thead>
                <tbody>
                  {rawRows.slice(0,3).map((r,i)=>(
                    <tr key={i}>{r.map((c,j)=><td key={j} style={{color:"#64748b",padding:"4px 8px",whiteSpace:"nowrap"}}>{String(c).slice(0,25)}</td>)}</tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end"}}>
              <Btn onClick={()=>setStep("upload")} variant="secondary">← Voltar</Btn>
              <Btn onClick={buildPreview} icon="arrow">Ver Preview →</Btn>
            </div>
          </div>
        )}

        {/* PREVIEW */}
        {step==="preview" && (
          <div>
            <div style={{display:"flex",gap:"0.8rem",marginBottom:"1.2rem"}}>
              <div style={{flex:1,padding:"0.9rem",background:"rgba(52,211,153,0.07)",border:"1px solid rgba(52,211,153,0.18)",borderRadius:"12px",textAlign:"center"}}>
                <div style={{color:"#34d399",fontSize:"1.6rem",fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{okCount}</div>
                <div style={{color:"#475569",fontSize:"0.72rem",marginTop:"2px"}}>prontos para importar</div>
              </div>
              <div style={{flex:1,padding:"0.9rem",background:"rgba(248,113,113,0.07)",border:"1px solid rgba(248,113,113,0.18)",borderRadius:"12px",textAlign:"center"}}>
                <div style={{color:"#f87171",fontSize:"1.6rem",fontWeight:700,fontFamily:"'Syne',sans-serif"}}>{badCount}</div>
                <div style={{color:"#475569",fontSize:"0.72rem",marginTop:"2px"}}>com erros (ignorados)</div>
              </div>
            </div>

            {errors.length > 0 && (
              <div style={{marginBottom:"1rem",padding:"0.8rem 1rem",background:"rgba(239,68,68,0.05)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:"10px",maxHeight:"100px",overflowY:"auto"}}>
                <div style={{color:"#f87171",fontSize:"0.68rem",fontWeight:700,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.4rem"}}>Erros encontrados</div>
                {errors.map((e,i)=><div key={i} style={{color:"#fca5a5",fontSize:"0.77rem",lineHeight:1.7}}>{e}</div>)}
              </div>
            )}

            <div style={{overflowX:"auto",maxHeight:"300px",overflowY:"auto",borderRadius:"10px",border:C.border}}>
              <table style={{borderCollapse:"collapse",fontSize:"0.78rem",width:"100%"}}>
                <thead style={{position:"sticky",top:0,background:"#091422",zIndex:1}}>
                  <tr>
                    {["","Data","Req.","Cliente","Produto","Qtd.","V.Unit","Total"].map((h,i)=>(
                      <th key={i} style={{padding:"0.65rem 0.8rem",textAlign:i>4?"right":"left",color:"#334155",fontWeight:600,fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.08em",borderBottom:C.borderFaint,whiteSpace:"nowrap"}}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {preview.map((r,i)=>(
                    <tr key={i} style={{borderBottom:C.borderFaint,background:r._ok?"transparent":"rgba(239,68,68,0.03)"}}>
                      <td style={{padding:"0.55rem 0.8rem",textAlign:"center"}}>
                        {r._ok
                          ? <span style={{color:"#34d399",fontSize:"0.85rem"}}>✓</span>
                          : <span title={r._errs.join(", ")} style={{color:"#f87171",fontSize:"0.85rem",cursor:"help"}}>✗</span>
                        }
                      </td>
                      <td style={{padding:"0.55rem 0.8rem",color:"#64748b",whiteSpace:"nowrap"}}>{r.data}</td>
                      <td style={{padding:"0.55rem 0.8rem",color:"#64748b"}}>{r.reqNum||"—"}</td>
                      <td style={{padding:"0.55rem 0.8rem",color:r.clienteId?"#e2e8f0":"#f87171",fontWeight:r.clienteId?400:600}}>{r.clienteStr}</td>
                      <td style={{padding:"0.55rem 0.8rem",color:r.produtoId?"#e2e8f0":"#f87171",fontWeight:r.produtoId?400:600}}>{r.produtoStr}</td>
                      <td style={{padding:"0.55rem 0.8rem",textAlign:"right",color:"#94a3b8"}}>{fmt(r.qtd)}</td>
                      <td style={{padding:"0.55rem 0.8rem",textAlign:"right",color:"#94a3b8"}}>{fmt(r.valorUnit)}</td>
                      <td style={{padding:"0.55rem 0.8rem",textAlign:"right",color:"#f1f5f9",fontWeight:600}}>{fmt(r.total)} MT</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end",marginTop:"1.2rem"}}>
              <Btn onClick={()=>setStep("mapping")} variant="secondary">← Voltar</Btn>
              <Btn onClick={doImport} icon="save" disabled={okCount===0 || importing}>
                {importing ? `A importar... ${done}/${okCount}` : `Importar ${okCount} pedidos`}
              </Btn>
            </div>

            {importing && (
              <div style={{marginTop:"0.8rem"}}>
                <div style={{height:"4px",background:"rgba(255,255,255,0.05)",borderRadius:"999px",overflow:"hidden"}}>
                  <div style={{height:"100%",width:`${okCount?((done/okCount)*100):0}%`,background:"linear-gradient(90deg,#f59e0b,#d97706)",borderRadius:"999px",transition:"width 0.3s"}}/>
                </div>
              </div>
            )}
          </div>
        )}

        {/* DONE */}
        {step==="done" && (
          <div style={{textAlign:"center",padding:"2.5rem 1rem"}}>
            <div style={{fontSize:"3.5rem",marginBottom:"1rem"}}>✅</div>
            <div style={{color:"#34d399",fontWeight:700,fontSize:"1.1rem",marginBottom:"0.4rem"}}>{done} pedidos importados!</div>
            {badCount>0 && <div style={{color:"#475569",fontSize:"0.82rem",marginBottom:"1.5rem"}}>{badCount} linhas ignoradas por erros.</div>}
            <Btn onClick={onClose} icon="check">Fechar</Btn>
          </div>
        )}
      </div>
    </Modal>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ORDERS
// ════════════════════════════════════════════════════════════════════════════
function Orders({ orders, clients, products, payments, onSave, onDelete }) {
  const [search, setSearch]       = useState("");
  const [modal, setModal]         = useState(false);
  const [importModal, setImportModal] = useState(false);
  const [form, setForm]           = useState({});
  const [filterPag, setFilterPag] = useState("todos");

  const openNew  = () => { setForm({data:new Date().toISOString().split("T")[0],reqNum:"",clienteId:clients[0]?.id||"",produtoId:products[0]?.id||"",qtd:"",valorUnit:products[0]?.preco||0}); setModal(true); };
  const openEdit = (o) => { setForm({...o}); setModal(true); };
  const calcT    = (q,v)=>(parseFloat(q)||0)*(parseFloat(v)||0);
  const handleProd = (pid) => { const p=products.find(x=>x.id===parseInt(pid)); setForm(f=>({...f,produtoId:parseInt(pid),valorUnit:p?.preco||0,total:calcT(f.qtd,p?.preco||0)})); };
  const handleSave = () => {
    if(!form.clienteId||!form.produtoId||!form.qtd) return;
    onSave({...form,id:form.id||genId(),clienteId:parseInt(form.clienteId),produtoId:parseInt(form.produtoId),qtd:parseFloat(form.qtd),valorUnit:parseFloat(form.valorUnit),total:calcT(form.qtd,form.valorUnit)});
    setModal(false);
  };

  const allWithPag = orders.map(o=>{
    const wp=calcOrdersPago(o.clienteId,orders,payments).find(x=>x.id===o.id);
    return {...o,...(wp||{})};
  });

  const filtered = allWithPag.filter(o=>{
    const c=clients.find(x=>x.id===o.clienteId); const p=products.find(x=>x.id===o.produtoId);
    return (!search||(o.reqNum||"").includes(search)||(c?.nome||"").toLowerCase().includes(search.toLowerCase())||(p?.nome||"").toLowerCase().includes(search.toLowerCase()))
      &&(filterPag==="todos"||o.estadoPag===filterPag);
  }).sort((a,b)=>new Date(b.data)-new Date(a.data));

  const totalFiltered   = filtered.reduce((s,o)=>s+o.total,0);
  const dividaFiltered  = filtered.reduce((s,o)=>s+(o.valorDivida||0),0);

  return (
    <div>
      <PageHeader
        title="Pedidos"
        sub={<>{filtered.length} pedidos · {fmt(totalFiltered)} MT · Em dívida: <span style={{color:"#f87171"}}>{fmt(dividaFiltered)} MT</span></>}
        action={
          <div style={{display:"flex",gap:"0.6rem"}}>
            <Btn onClick={()=>setImportModal(true)} variant="ghost" icon="file">Importar Excel</Btn>
            <Btn onClick={openNew} icon="plus">Novo Pedido</Btn>
          </div>
        }
      />

      <div style={{background:C.bg,border:C.border,borderRadius:"14px",padding:"0.75rem 1rem",marginBottom:"1.2rem",display:"flex",gap:"1rem",alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",gap:"0.6rem",alignItems:"center",flex:1,minWidth:"180px"}}>
          <Icon name="search" size={15}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Pesquisar por req., cliente, produto..." style={{background:"none",border:"none",outline:"none",color:"#e2e8f0",flex:1,fontSize:"0.85rem",fontFamily:"inherit"}}/>
        </div>
        <div style={{display:"flex",gap:"5px",flexWrap:"wrap"}}>
          {[["todos","Todos"],["pago","Pago"],["parcial","Parcial"],["divida","Por pagar"]].map(([v,l])=>(
            <FilterPill key={v} label={l} active={filterPag===v} onClick={()=>setFilterPag(v)} activeColor="#60a5fa"/>
          ))}
        </div>
      </div>

      <Card>
        <Table headers={["Data","Req.","Cliente","Produto","Qtd.","P.Unit.","Total","Pago","Em Dívida","Pag.","Ações"]}>
          {filtered.map(o=>{
            const c=clients.find(x=>x.id===o.clienteId); const p=products.find(x=>x.id===o.produtoId);
            return (
              <TR key={o.id}>
                <TD muted>{fmtDate(o.data)}</TD>
                <TD bold>{o.reqNum||"—"}</TD>
                <TD>{c?.nome?.split(",")[0]||"—"}</TD>
                <TD><span style={{color:p?.cor,fontWeight:600}}>{p?.nome}</span></TD>
                <TD right muted>{fmt(o.qtd)} {p?.unidade}</TD>
                <TD right muted>{fmt(o.valorUnit)}</TD>
                <TD bold right style={{color:"#f1f5f9"}}>{fmt(o.total)} MT</TD>
                <TD right style={{color:"#34d399"}}>{fmt(o.valorPago||0)} MT</TD>
                <TD right style={{color:(o.valorDivida||0)>0.01?"#f87171":"#334155"}}>{fmt(o.valorDivida||0)} MT</TD>
                <TD>{o.estadoPag&&<Badge status={o.estadoPag}/>}</TD>
                <TD><div style={{display:"flex",gap:"5px"}}>
                  <IconBtn onClick={()=>printInvoice(o,c,p)} icon="print" color="#60a5fa" title="Imprimir Factura"/>
                  <IconBtn onClick={()=>openEdit(o)} icon="edit" color="#f59e0b" title="Editar"/>
                  <IconBtn onClick={()=>onDelete(o.id)} icon="trash" color="#f87171" title="Eliminar"/>
                </div></TD>
              </TR>
            );
          })}
        </Table>
        {filtered.length===0&&<div style={{textAlign:"center",padding:"3rem",color:"#475569"}}>Nenhum pedido encontrado</div>}
      </Card>

      {importModal && <ExcelImportModal clients={clients} products={products} onImport={onSave} onClose={()=>setImportModal(false)}/>}

      {modal&&(
        <Modal title={form.id?"Editar Pedido":"Novo Pedido"} onClose={()=>setModal(false)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <Field label="Data *"><Input type="date" value={form.data||""} onChange={e=>setForm({...form,data:e.target.value})}/></Field>
            <Field label="N.º Requisição"><Input value={form.reqNum||""} onChange={e=>setForm({...form,reqNum:e.target.value})} placeholder="001"/></Field>
          </div>
          <Field label="Cliente *">
            <Select value={form.clienteId||""} onChange={e=>setForm({...form,clienteId:parseInt(e.target.value)})}>
              <option value="">— Seleccionar —</option>
              {clients.map(c=><option key={c.id} value={c.id}>{c.nome}</option>)}
            </Select>
          </Field>
          <Field label="Produto *">
            <Select value={form.produtoId||""} onChange={e=>handleProd(e.target.value)}>
              <option value="">— Seleccionar —</option>
              {products.map(p=><option key={p.id} value={p.id}>{p.nome} — {fmt(p.preco)} MT/{p.unidade}</option>)}
            </Select>
          </Field>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <Field label="Quantidade *"><Input type="number" step="0.01" value={form.qtd||""} onChange={e=>setForm(f=>({...f,qtd:e.target.value}))}/></Field>
            <Field label="Preço Unitário (MT)"><Input type="number" step="0.01" value={form.valorUnit||""} onChange={e=>setForm(f=>({...f,valorUnit:e.target.value}))}/></Field>
          </div>
          <div style={{background:C.bgDeep,borderRadius:"12px",padding:"1rem 1.2rem",marginTop:"0.5rem",display:"flex",justifyContent:"space-between",alignItems:"center",border:C.border}}>
            <span style={{color:"#475569",fontSize:"0.82rem"}}>Total calculado</span>
            <span style={{color:"#f59e0b",fontSize:"1.4rem",fontWeight:700,fontFamily:"'Syne',sans-serif",letterSpacing:"-0.02em"}}>{fmt(calcT(form.qtd,form.valorUnit))} MT</span>
          </div>
          <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end",marginTop:"1.2rem"}}>
            <Btn onClick={()=>setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSave} icon="save">Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}


// ════════════════════════════════════════════════════════════════════════════
// REPORTS
// ════════════════════════════════════════════════════════════════════════════
function Reports({ orders, clients, products, payments }) {
  const [selectedClient, setSelectedClient] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo]     = useState("");

  const filteredOrders = orders.filter(o=>{
    const matchC=selectedClient==="all"||o.clienteId===parseInt(selectedClient);
    return matchC&&(!dateFrom||o.data>=dateFrom)&&(!dateTo||o.data<=dateTo);
  });

  const totalVendas  = filteredOrders.reduce((s,o)=>s+o.total,0);
  const totalLitros  = filteredOrders.reduce((s,o)=>s+o.qtd,0);
  const totalPago    = (selectedClient==="all"?payments:payments.filter(p=>p.clienteId===parseInt(selectedClient))).reduce((s,p)=>s+p.valor,0);
  const totalDivida  = Math.max(0,totalVendas-totalPago);

  const byProduct = products.map(p=>({...p,qtd:filteredOrders.filter(o=>o.produtoId===p.id).reduce((s,o)=>s+o.qtd,0),total:filteredOrders.filter(o=>o.produtoId===p.id).reduce((s,o)=>s+o.total,0),count:filteredOrders.filter(o=>o.produtoId===p.id).length})).filter(p=>p.count>0);
  const byClient  = clients.map(c=>({...c,...calcSaldo(c.id,orders,payments),count:orders.filter(o=>o.clienteId===c.id).length})).sort((a,b)=>b.faturado-a.faturado);

  return (
    <div>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.5rem"}}>
        <div>
          <h2 style={{color:"#f1f5f9",fontFamily:"'Syne',sans-serif",fontSize:"1.4rem",margin:"0 0 0.3rem"}}>Relatórios</h2>
          <p style={{color:"#475569",fontSize:"0.85rem",margin:0}}>Análise de vendas, pagamentos e saldos</p>
        </div>
        <div style={{display:"flex",gap:"0.6rem"}}>
          <Btn onClick={()=>exportCSV(filteredOrders.map(o=>({data:fmtDate(o.data),req:o.reqNum,cliente:clients.find(x=>x.id===o.clienteId)?.nome||"",produto:products.find(x=>x.id===o.produtoId)?.nome||"",qtd:o.qtd,total:o.total,status:o.status})),[{key:"data",label:"Data"},{key:"req",label:"Req."},{key:"cliente",label:"Cliente"},{key:"produto",label:"Produto"},{key:"qtd",label:"Qtd"},{key:"total",label:"Total (MT)"},{key:"status",label:"Estado"}],"relatorio-pedidos.csv")} icon="file" variant="secondary">Exportar CSV</Btn>
          <Btn onClick={()=>window.print()} icon="print" variant="secondary">Imprimir</Btn>
        </div>
      </div>

      <div style={{background:C.bg,border:C.border,borderRadius:"14px",padding:"1.2rem",marginBottom:"1.5rem"}}>
        <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"1rem"}}>
          {[["Cliente","all",clients,c=>c.nome.split(",")[0],"selectedClient",setSelectedClient],].map(()=>(
            <div key="c">
              <label style={{display:"block",color:"#475569",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"5px"}}>Cliente</label>
              <Select value={selectedClient} onChange={e=>setSelectedClient(e.target.value)}>
                <option value="all">Todos os clientes</option>
                {clients.map(c=><option key={c.id} value={c.id}>{c.nome.split(",")[0]}</option>)}
              </Select>
            </div>
          ))}
          <div>
            <label style={{display:"block",color:"#475569",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"5px"}}>De</label>
            <Input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}/>
          </div>
          <div>
            <label style={{display:"block",color:"#475569",fontSize:"0.72rem",textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"5px"}}>Até</label>
            <Input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}/>
          </div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:"1rem",marginBottom:"1.5rem"}}>
        <StatCard label="Total Faturado"  value={`${fmt(totalVendas)} MT`}  color="#f59e0b" icon="money"/>
        <StatCard label="Total Recebido"  value={`${fmt(totalPago)} MT`}    color="#10b981" icon="payments"/>
        <StatCard label="Por Receber"     value={`${fmt(totalDivida)} MT`}  color="#ef4444" icon="alert"/>
        <StatCard label="Volume"          value={`${fmt(totalLitros)} L`}   color="#3b82f6" icon="fuel"/>
      </div>

      {/* Saldos */}
      <div style={{background:C.bg,border:C.border,borderRadius:"14px",overflow:"hidden",marginBottom:"1.5rem"}}>
        <div style={{padding:"1rem 1.4rem",borderBottom:C.border}}><h4 style={{color:"#94a3b8",margin:0,fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em"}}>Saldos por Cliente</h4></div>
        <Table headers={["Cliente","Pedidos","Faturado","Pago","Saldo","Estado"]}>
          {byClient.map(c=>(
            <TR key={c.id}>
              <TD bold>{c.nome.split(",")[0]}</TD>
              <TD right muted>{c.count}</TD>
              <TD right>{fmt(c.faturado)} MT</TD>
              <TD right style={{color:"#10b981"}}>{fmt(c.pago)} MT</TD>
              <TD right style={{color:c.saldo<0?"#ef4444":c.saldo>0?"#10b981":"#64748b",fontWeight:700}}>
                {c.saldo<0?"-":c.saldo>0?"+":""}{fmt(Math.abs(c.saldo))} MT
              </TD>
              <TD><SaldoBadge saldo={c.saldo}/></TD>
            </TR>
          ))}
        </Table>
      </div>

      {/* Por produto */}
      <div style={{background:C.bg,border:C.border,borderRadius:"14px",overflow:"hidden",marginBottom:"1.5rem"}}>
        <div style={{padding:"1rem 1.4rem",borderBottom:C.border}}><h4 style={{color:"#94a3b8",margin:0,fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em"}}>Por Produto</h4></div>
        <Table headers={["Produto","Pedidos","Quantidade","Valor (MT)","% do Total"]}>
          {byProduct.map(p=>(
            <TR key={p.id}>
              <TD><span style={{color:p.cor}}>● </span>{p.nome}</TD>
              <TD right>{p.count}</TD>
              <TD right bold>{fmt(p.qtd)} {p.unidade}</TD>
              <TD bold right>{fmt(p.total)} MT</TD>
              <TD right muted>{totalVendas?((p.total/totalVendas)*100).toFixed(1):0}%</TD>
            </TR>
          ))}
          <tr style={{background:C.bgDeep}}><td colSpan={3} style={{padding:"0.75rem 1rem",color:"#f1f5f9",fontWeight:700}}>TOTAL</td><td style={{padding:"0.75rem 1rem",color:"#f59e0b",fontWeight:700,textAlign:"right"}}>{fmt(totalVendas)} MT</td><td style={{padding:"0.75rem 1rem",color:"#475569",textAlign:"right"}}>100%</td></tr>
        </Table>
      </div>

      {/* Detalhe */}
      <div style={{background:C.bg,border:C.border,borderRadius:"14px",overflow:"hidden"}}>
        <div style={{padding:"1rem 1.4rem",borderBottom:C.border}}><h4 style={{color:"#94a3b8",margin:0,fontSize:"0.75rem",textTransform:"uppercase",letterSpacing:"0.1em"}}>Detalhe dos Pedidos ({filteredOrders.length})</h4></div>
        <Table headers={["Data","Req.","Cliente","Produto","Qtd.","Total","Pago","Dívida","Pag."]}>
          {filteredOrders.sort((a,b)=>new Date(b.data)-new Date(a.data)).map(o=>{
            const c=clients.find(x=>x.id===o.clienteId);const p=products.find(x=>x.id===o.produtoId);
            const wp=calcOrdersPago(o.clienteId,orders,payments).find(x=>x.id===o.id);
            return (
              <TR key={o.id}>
                <TD muted>{fmtDate(o.data)}</TD>
                <TD bold>{o.reqNum||"—"}</TD>
                <TD>{c?.nome?.split(",")[0]||"—"}</TD>
                <TD><span style={{color:p?.cor}}>{p?.nome}</span></TD>
                <TD right>{fmt(o.qtd)} {p?.unidade}</TD>
                <TD bold right>{fmt(o.total)} MT</TD>
                <TD right style={{color:"#10b981"}}>{fmt(wp?.valorPago||0)} MT</TD>
                <TD right style={{color:(wp?.valorDivida||0)>0.01?"#ef4444":"#64748b"}}>{fmt(wp?.valorDivida||0)} MT</TD>
                <TD>{wp&&<Badge status={wp.estadoPag}/>}</TD>
              </TR>
            );
          })}
        </Table>
      </div>
    </div>
  );
}

// ─── PDF — FATURA MENSAL ──────────────────────────────────────────────────────
const printMonthlyInvoice = (invoice, client, orders, products) => {
  const monthOrders = orders.filter(o => o.clienteId === client.id && o.data.startsWith(invoice.periodo) && o.status !== "cancelado");
  const total       = monthOrders.reduce((s, o) => s + o.total, 0);
  const mesLabel    = new Date(invoice.periodo + "-01").toLocaleDateString("pt-MZ", { month:"long", year:"numeric" });

  const w = window.open("", "_blank", "width=860,height=680");
  w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
  <title>Fatura ${invoice.numero} — ${client.nome}</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Segoe UI',Arial,sans-serif;background:#fff;color:#1a1a1a;padding:48px}
    .hdr{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:36px;padding-bottom:24px;border-bottom:3px solid #f59e0b}
    .brand-logo{width:48px;height:48px;background:linear-gradient(135deg,#f59e0b,#d97706);border-radius:12px;display:flex;align-items:center;justify-content:center;margin-bottom:8px}
    .brand-name{font-size:1.6rem;font-weight:900;letter-spacing:-1px;color:#111}.brand-name span{color:#f59e0b}
    .brand-sub{color:#888;font-size:.78rem;margin-top:2px}
    .inv-title{font-size:2rem;font-weight:900;color:#f59e0b;letter-spacing:2px;text-align:right}
    .inv-meta{text-align:right;font-size:.82rem;color:#666;margin-top:4px;line-height:1.6}
    .inv-meta strong{color:#333}
    .two-col{display:grid;grid-template-columns:1fr 1fr;gap:32px;margin:28px 0}
    .section-label{font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.12em;color:#bbb;margin-bottom:8px}
    .section-val{font-size:.92rem;line-height:1.7;color:#333}.section-val strong{color:#111;font-size:1rem}
    .periodo-box{background:#fffbeb;border:1px solid #f59e0b;border-radius:8px;padding:10px 16px;margin-bottom:24px;display:flex;align-items:center;gap:10px}
    .periodo-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#92400e}
    .periodo-val{font-size:1rem;font-weight:700;color:#d97706}
    table{width:100%;border-collapse:collapse;margin:8px 0 24px}
    thead tr{background:#f8f8f8}
    th{padding:10px 14px;text-align:left;font-size:.68rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#999;border-bottom:2px solid #eee}
    th.right{text-align:right} td.right{text-align:right} td.center{text-align:center}
    td{padding:12px 14px;font-size:.88rem;border-bottom:1px solid #f0f0f0}
    tbody tr:last-child td{border-bottom:none}
    .subtotal-row td{background:#f8f8f8;font-weight:600;font-size:.88rem}
    .total-section{display:flex;justify-content:flex-end;margin-top:4px}
    .total-box{background:#111;border-radius:12px;padding:20px 32px;min-width:260px}
    .total-label{font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#aaa;margin-bottom:6px}
    .total-val{font-size:2.2rem;font-weight:900;color:#f59e0b}
    .notes-box{margin-top:32px;padding:16px;background:#f8f8f8;border-radius:8px;border-left:3px solid #f59e0b}
    .notes-label{font-size:.7rem;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#aaa;margin-bottom:6px}
    .notes-val{font-size:.85rem;color:#555;line-height:1.5}
    .footer{margin-top:40px;padding-top:20px;border-top:1px solid #eee;display:flex;justify-content:space-between;color:#ccc;font-size:.72rem}
    .watermark{display:inline-block;padding:3px 12px;border-radius:20px;font-size:.72rem;font-weight:700;text-transform:uppercase;letter-spacing:.08em;background:#d1fae5;color:#065f46}
    @media print{@page{margin:1.5cm}body{padding:0}.print-btn{display:none!important}}
    .print-btn{position:fixed;top:20px;right:20px;background:#f59e0b;color:#000;border:none;border-radius:8px;padding:10px 20px;font-size:.9rem;font-weight:700;cursor:pointer;box-shadow:0 4px 12px rgba(245,158,11,.4)}
  </style></head><body>
  <button class="print-btn" onclick="window.print()">🖨 Imprimir / PDF</button>

  <div class="hdr">
    <div>
      <div class="brand-logo">
        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="#000" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3h2l.4 2M7 13h10l4-8H5.4M7 13 5.4 5M7 13l-2 5h12M9 21a1 1 0 1 0 0-2 1 1 0 0 0 0 2zm6 0a1 1 0 1 0 0-2 1 1 0 0 0 0 2z"/></svg>
      </div>
      <div class="brand-name">Fuel<span>Flow</span></div>
      <div class="brand-sub">Gestão de Combustíveis · Moçambique</div>
    </div>
    <div>
      <div class="inv-title">FATURA</div>
      <div class="inv-meta">
        N.º <strong>${invoice.numero}</strong><br>
        Referente a: <strong>${mesLabel}</strong><br>
        Emitida em: ${new Date().toLocaleDateString("pt-MZ")}
      </div>
    </div>
  </div>

  <div class="two-col">
    <div>
      <div class="section-label">Fornecedor</div>
      <div class="section-val">
        <strong>FuelFlow Moçambique</strong><br>
        Gestão de Combustíveis<br>
        Maputo, Moçambique
      </div>
    </div>
    <div>
      <div class="section-label">Faturado a</div>
      <div class="section-val">
        <strong>${client.nome}</strong><br>
        NIF/NUIT: ${client.nif || "—"}<br>
        ${client.cidade || ""}${client.contacto ? " · " + client.contacto : ""}
        ${client.email ? "<br>" + client.email : ""}
      </div>
    </div>
  </div>

  <div class="periodo-box">
    <div>
      <div class="periodo-label">Período de Faturação</div>
      <div class="periodo-val">${mesLabel}</div>
    </div>
    <div style="margin-left:auto"><span class="watermark">${monthOrders.length} fornecimento${monthOrders.length !== 1 ? "s" : ""}</span></div>
  </div>

  <table>
    <thead>
      <tr>
        <th>Data</th>
        <th>Req. N.º</th>
        <th>Produto</th>
        <th class="right">Quantidade</th>
        <th class="right">Preço Unit.</th>
        <th class="right">Total</th>
      </tr>
    </thead>
    <tbody>
      ${monthOrders.map(o => {
        const p = products.find(x => x.id === o.produtoId);
        return `<tr>
          <td>${fmtDate(o.data)}</td>
          <td>${o.reqNum || "—"}</td>
          <td>${p?.nome || "—"}</td>
          <td class="right">${fmt(o.qtd)} ${p?.unidade || ""}</td>
          <td class="right">${fmt(o.valorUnit)} MT</td>
          <td class="right"><strong>${fmt(o.total)} MT</strong></td>
        </tr>`;
      }).join("")}
      <tr class="subtotal-row">
        <td colspan="3"><strong>Subtotal</strong></td>
        <td class="right">${fmt(monthOrders.reduce((s,o)=>s+o.qtd,0))} L</td>
        <td></td>
        <td class="right"><strong>${fmt(total)} MT</strong></td>
      </tr>
    </tbody>
  </table>

  <div class="total-section">
    <div class="total-box">
      <div class="total-label">Total a Pagar</div>
      <div class="total-val">${fmt(total)} MT</div>
      <div style="color:#666;font-size:.78rem;margin-top:8px">${monthOrders.length} pedido${monthOrders.length !== 1 ? "s" : ""} · ${fmt(monthOrders.reduce((s,o)=>s+o.qtd,0))} litros</div>
    </div>
  </div>

  ${invoice.notas ? `<div class="notes-box"><div class="notes-label">Observações</div><div class="notes-val">${invoice.notas}</div></div>` : ""}

  <div class="footer">
    <span>FuelFlow · Sistema de Gestão de Combustíveis · Moçambique</span>
    <span>Fatura N.º ${invoice.numero} · Gerada em ${new Date().toLocaleDateString("pt-MZ")}</span>
  </div>
  </body></html>`);
  w.document.close();
};

// ════════════════════════════════════════════════════════════════════════════
// FATURAS
// ════════════════════════════════════════════════════════════════════════════
function Faturas({ clients, orders, products, payments, invoices, onSave, onDelete }) {
  const [modal,        setModal]        = useState(false);
  const [previewModal, setPreviewModal] = useState(null); // invoice to preview before emit
  const [form,         setForm]         = useState({ clienteId:"", periodo:"", notas:"" });
  const [filterClient, setFilterClient] = useState("all");

  // Available months derived from orders
  const availableMonths = useMemo(() => {
    const months = [...new Set(orders.map(o => o.data.slice(0,7)))].sort().reverse();
    return months;
  }, [orders]);

  // Orders for selected client+month in form
  const previewOrders = useMemo(() => {
    if (!form.clienteId || !form.periodo) return [];
    return orders.filter(o =>
      o.clienteId === parseInt(form.clienteId) &&
      o.data.startsWith(form.periodo) &&
      o.status !== "cancelado"
    );
  }, [form.clienteId, form.periodo, orders]);

  const previewTotal = previewOrders.reduce((s,o) => s+o.total, 0);

  const genInvNumber = () => {
    const year  = new Date().getFullYear();
    const count = invoices.filter(i => i.numero.includes(`FT-${year}`)).length + 1;
    return `FT-${year}-${String(count).padStart(4,"0")}`;
  };

  const handleEmit = () => {
    if (!form.clienteId || !form.periodo || previewOrders.length === 0) return;
    const inv = {
      id:         genId(),
      numero:     genInvNumber(),
      clienteId:  parseInt(form.clienteId),
      periodo:    form.periodo,
      total:      previewTotal,
      notas:      form.notas,
      emitidaEm:  new Date().toISOString().split("T")[0],
      estado:     "emitida",
    };
    onSave(inv);
    setModal(false);
    // auto-print
    const c = clients.find(x => x.id === inv.clienteId);
    printMonthlyInvoice(inv, c, orders, products);
  };

  const filtered = (filterClient === "all" ? invoices : invoices.filter(i => i.clienteId === parseInt(filterClient)))
    .sort((a,b) => new Date(b.emitidaEm) - new Date(a.emitidaEm));

  const totalEmitido = filtered.reduce((s,i) => s+i.total, 0);

  const fmtPeriodo = (p) => new Date(p + "-01").toLocaleDateString("pt-MZ", { month:"long", year:"numeric" });

  return (
    <div>
      {/* Cabeçalho */}
      <div style={{ display:"flex", justifyContent:"space-between", alignItems:"center", marginBottom:"1.5rem" }}>
        <div>
          <h2 style={{ color:"#f1f5f9", fontFamily:"'Syne',sans-serif", fontSize:"1.25rem", margin:"0 0 0.25rem", fontWeight:700, letterSpacing:"-0.025em" }}>Faturas Mensais</h2>
          <p style={{ color:"#475569", fontSize:"0.8rem", margin:0 }}>{invoices.length} fatura{invoices.length!==1?"s":""} emitida{invoices.length!==1?"s":""}</p>
        </div>
        <Btn onClick={() => { setForm({clienteId:"",periodo:availableMonths[0]||"",notas:""}); setModal(true); }} icon="file">Emitir Fatura</Btn>
      </div>

      {/* Stats rápidos */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))", gap:"1rem", marginBottom:"1.5rem" }}>
        <StatCard label="Faturas Emitidas" value={invoices.length}         color="#f59e0b" icon="file"/>
        <StatCard label="Valor Total"      value={`${fmt(invoices.reduce((s,i)=>s+i.total,0))} MT`} color="#3b82f6" icon="money"/>
        <StatCard label="Clientes Faturados" value={[...new Set(invoices.map(i=>i.clienteId))].length} color="#10b981" icon="clients"/>
      </div>

      {/* Filtro */}
      <div style={{ background:C.bg, border:C.border, borderRadius:"12px", padding:"0.9rem 1.2rem", marginBottom:"1.2rem", display:"flex", justifyContent:"space-between", alignItems:"center", gap:"1rem", flexWrap:"wrap" }}>
        <Select value={filterClient} onChange={e=>setFilterClient(e.target.value)} style={{ maxWidth:"260px", padding:"0.4rem 0.8rem" }}>
          <option value="all">Todos os clientes</option>
          {clients.map(c => <option key={c.id} value={c.id}>{c.nome.split(",")[0]}</option>)}
        </Select>
        {filtered.length > 0 && (
          <span style={{ color:"#475569", fontSize:"0.82rem" }}>
            {filtered.length} fatura{filtered.length!==1?"s":""} · <strong style={{color:"#f59e0b"}}>{fmt(totalEmitido)} MT</strong>
          </span>
        )}
      </div>

      {/* Lista de faturas emitidas */}
      {filtered.length === 0 ? (
        <div style={{ background:C.bg, border:"2px dashed #1e3a5f", borderRadius:"14px", padding:"4rem", textAlign:"center" }}>
          <Icon name="file" size={40}/>
          <p style={{ color:"#94a3b8", marginTop:"1rem", fontSize:"1rem", fontWeight:600 }}>Nenhuma fatura emitida</p>
          <p style={{ color:"#475569", marginTop:"0.4rem", fontSize:"0.85rem" }}>Clica em "Emitir Fatura" para gerar a primeira fatura mensal</p>
        </div>
      ) : (
        <div style={{ background:C.bg, border:C.border, borderRadius:"14px", overflow:"hidden" }}>
          <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.85rem" }}>
            <thead>
              <tr>
                {["N.º Fatura","Cliente","Período","Emitida em","Pedidos","Total","Estado","Ações"].map((h,i) => (
                  <th key={i} style={{ padding:"0.7rem 1.1rem", textAlign: i>=4?"right":"left", color:"#334155", fontWeight:600, fontSize:"0.65rem", textTransform:"uppercase", letterSpacing:"0.1em", borderBottom:C.borderFaint, background:"rgba(0,0,0,0.2)", whiteSpace:"nowrap" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map(inv => {
                const c          = clients.find(x => x.id === inv.clienteId);
                const invOrders  = orders.filter(o => o.clienteId === inv.clienteId && o.data.startsWith(inv.periodo) && o.status !== "cancelado");
                const { saldo }  = calcSaldo(inv.clienteId, orders, payments);
                const paidThis   = Math.min(payments.filter(p=>p.clienteId===inv.clienteId).reduce((s,p)=>s+p.valor,0), inv.total);
                return (
                  <tr key={inv.id}
                    style={{ borderBottom:"1px solid #0d2137" }}
                    onMouseEnter={e => e.currentTarget.style.background="rgba(30,58,95,0.18)"}
                    onMouseLeave={e => e.currentTarget.style.background="transparent"}>
                    <td style={{ padding:"0.9rem 1.1rem" }}>
                      <span style={{ color:"#f59e0b", fontWeight:700, fontFamily:"'Syne',sans-serif" }}>{inv.numero}</span>
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem" }}>
                      <div style={{ color:"#f1f5f9", fontWeight:600, fontSize:"0.84rem" }}>{c?.nome?.split(",")[0]||"—"}</div>
                      <div style={{ color:"#475569", fontSize:"0.72rem" }}>NIF: {c?.nif||"—"}</div>
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", color:"#cbd5e1", whiteSpace:"nowrap" }}>
                      {fmtPeriodo(inv.periodo)}
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", color:"#475569", whiteSpace:"nowrap" }}>
                      {fmtDate(inv.emitidaEm)}
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", textAlign:"right", color:"#94a3b8" }}>
                      {invOrders.length} pedido{invOrders.length!==1?"s":""}
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", textAlign:"right", color:"#f59e0b", fontWeight:700, whiteSpace:"nowrap" }}>
                      {fmt(inv.total)} MT
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", textAlign:"right" }}>
                      <span style={{ padding:"3px 10px", borderRadius:"20px", fontSize:"0.7rem", fontWeight:700, background:"rgba(16,185,129,0.1)", color:"#10b981", letterSpacing:"0.05em", textTransform:"uppercase" }}>Emitida</span>
                    </td>
                    <td style={{ padding:"0.9rem 1.1rem", textAlign:"right" }}>
                      <div style={{ display:"flex", gap:"5px", justifyContent:"flex-end" }}>
                        <button
                          onClick={() => printMonthlyInvoice(inv, c, orders, products)}
                          title="Reimprimir"
                          style={{ background:"rgba(59,130,246,0.1)", border:"1px solid rgba(59,130,246,0.25)", borderRadius:"6px", color:"#3b82f6", cursor:"pointer", padding:"5px", display:"flex" }}>
                          <Icon name="print" size={13}/>
                        </button>
                        <button
                          onClick={() => onDelete(inv.id)}
                          title="Anular"
                          style={{ background:"rgba(239,68,68,0.1)", border:"1px solid rgba(239,68,68,0.2)", borderRadius:"6px", color:"#ef4444", cursor:"pointer", padding:"5px", display:"flex" }}>
                          <Icon name="trash" size={13}/>
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Modal: Emitir Fatura */}
      {modal && (
        <Modal title="Emitir Fatura Mensal" onClose={() => setModal(false)} wide>
          {/* Info banner */}
          <div style={{ background:"rgba(139,92,246,0.08)", border:"1px solid rgba(139,92,246,0.25)", borderRadius:"10px", padding:"0.8rem 1rem", marginBottom:"1.2rem", display:"flex", alignItems:"center", gap:"10px" }}>
            <span style={{ fontSize:"1.1rem" }}>⬇</span>
            <div style={{ fontSize:"0.82rem", color:"#a78bfa" }}>
              As faturas mensais aplicam-se apenas a clientes <strong>Pós-pago</strong>. Os clientes pré-pago gerem o saldo por depósitos.
            </div>
          </div>
          <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"1.5rem" }}>
            {/* Coluna esquerda — formulário */}
            <div>
              <Field label="Cliente Pós-pago *">
                <Select value={form.clienteId} onChange={e => setForm({...form, clienteId:e.target.value})}>
                  <option value="">— Seleccionar Cliente —</option>
                  {clients.filter(c => c.tipo === "pos-pago" || !c.tipo).map(c => <option key={c.id} value={c.id}>{c.nome.split(",")[0]}</option>)}
                </Select>
              </Field>
              <Field label="Mês de Faturação *">
                <Select value={form.periodo} onChange={e => setForm({...form, periodo:e.target.value})}>
                  <option value="">— Seleccionar Mês —</option>
                  {availableMonths.map(m => (
                    <option key={m} value={m}>{fmtPeriodo(m)}</option>
                  ))}
                </Select>
              </Field>
              <Field label="Observações (opcional)">
                <textarea
                  value={form.notas}
                  onChange={e => setForm({...form, notas:e.target.value})}
                  placeholder="Ex: Pagamento a 30 dias, dados bancários, etc."
                  rows={4}
                  style={{ width:"100%", padding:"0.6rem 0.9rem", background:C.bgDeep, border:C.border, borderRadius:"8px", color:"#e2e8f0", fontSize:"0.9rem", outline:"none", resize:"vertical", boxSizing:"border-box" }}
                />
              </Field>

              {/* Aviso se já existe fatura para este período */}
              {form.clienteId && form.periodo && invoices.some(i => i.clienteId===parseInt(form.clienteId) && i.periodo===form.periodo) && (
                <div style={{ background:"rgba(245,158,11,0.08)", border:"1px solid rgba(245,158,11,0.3)", borderRadius:"8px", padding:"0.8rem 1rem", marginBottom:"1rem", color:"#f59e0b", fontSize:"0.82rem" }}>
                  ⚠ Já existe uma fatura emitida para este cliente neste período.
                </div>
              )}
            </div>

            {/* Coluna direita — prévia dos pedidos */}
            <div>
              <div style={{ color:"#475569", fontSize:"0.75rem", textTransform:"uppercase", letterSpacing:"0.08em", marginBottom:"0.8rem", fontWeight:600 }}>
                Prévia — Pedidos do Período
              </div>

              {!form.clienteId || !form.periodo ? (
                <div style={{ background:C.bgDeep, borderRadius:"12px", padding:"2.5rem", textAlign:"center", color:"#475569", border:"1px dashed #1e3a5f" }}>
                  <Icon name="file" size={28}/>
                  <p style={{ marginTop:"0.8rem", fontSize:"0.82rem" }}>Selecciona o cliente e o mês para ver os pedidos</p>
                </div>
              ) : previewOrders.length === 0 ? (
                <div style={{ background:C.bgDeep, borderRadius:"12px", padding:"2.5rem", textAlign:"center", color:"#475569", border:"1px dashed #1e3a5f" }}>
                  <Icon name="orders" size={28}/>
                  <p style={{ marginTop:"0.8rem", fontSize:"0.82rem" }}>Nenhum pedido entregue neste período</p>
                </div>
              ) : (
                <div>
                  <div style={{ background:C.bgDeep, border:C.border, borderRadius:"10px", overflow:"hidden", marginBottom:"1rem" }}>
                    <table style={{ width:"100%", borderCollapse:"collapse", fontSize:"0.8rem" }}>
                      <thead>
                        <tr>
                          {["Data","Req.","Produto","Qtd.","Total"].map((h,i) => (
                            <th key={i} style={{ padding:"0.55rem 0.8rem", textAlign:i>=3?"right":"left", color:"#475569", fontWeight:600, fontSize:"0.65rem", textTransform:"uppercase", background:"rgba(0,0,0,0.35)", borderBottom:C.border }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {previewOrders.map(o => {
                          const p = products.find(x => x.id === o.produtoId);
                          return (
                            <tr key={o.id} style={{ borderBottom:"1px solid #0d2137" }}>
                              <td style={{ padding:"0.55rem 0.8rem", color:"#475569" }}>{fmtDate(o.data)}</td>
                              <td style={{ padding:"0.55rem 0.8rem", color:"#cbd5e1", fontWeight:600 }}>{o.reqNum}</td>
                              <td style={{ padding:"0.55rem 0.8rem" }}><span style={{color:p?.cor}}>{p?.nome}</span></td>
                              <td style={{ padding:"0.55rem 0.8rem", textAlign:"right", color:"#94a3b8" }}>{fmt(o.qtd)} {p?.unidade}</td>
                              <td style={{ padding:"0.55rem 0.8rem", textAlign:"right", color:"#f59e0b", fontWeight:700 }}>{fmt(o.total)} MT</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  {/* Total */}
                  <div style={{ background:"linear-gradient(135deg,rgba(245,158,11,0.12),rgba(217,119,6,0.08))", border:"1px solid rgba(245,158,11,0.25)", borderRadius:"10px", padding:"1rem 1.2rem", display:"flex", justifyContent:"space-between", alignItems:"center" }}>
                    <div>
                      <div style={{ color:"#475569", fontSize:"0.7rem", textTransform:"uppercase", letterSpacing:"0.08em" }}>Total a Faturar</div>
                      <div style={{ color:"#94a3b8", fontSize:"0.75rem", marginTop:"2px" }}>{previewOrders.length} pedido{previewOrders.length!==1?"s":""} · {fmt(previewOrders.reduce((s,o)=>s+o.qtd,0))} litros</div>
                    </div>
                    <div style={{ color:"#f59e0b", fontSize:"1.8rem", fontWeight:800, fontFamily:"'Syne',sans-serif" }}>
                      {fmt(previewTotal)} MT
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div style={{ display:"flex", gap:"0.8rem", justifyContent:"flex-end", marginTop:"1.5rem", paddingTop:"1.2rem", borderTop:C.border }}>
            <Btn onClick={() => setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn
              onClick={handleEmit}
              icon="file"
              disabled={!form.clienteId || !form.periodo || previewOrders.length === 0}>
              Emitir &amp; Imprimir Fatura
            </Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════

// ════════════════════════════════════════════════════════════════════════════
// LOGIN SCREEN — Admin (email) ou Operador (username)
// ════════════════════════════════════════════════════════════════════════════
async function hashPassword(password) {
  const encoder = new TextEncoder();
  const data = encoder.encode(password + "fuelflow_salt_2024");
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash)).map(b=>b.toString(16).padStart(2,"0")).join("");
}

function LoginScreen({ onAdminLogin, onOperatorLogin }) {
  const [mode, setMode]         = useState("operador"); // operador | admin
  const [username, setUsername] = useState("");
  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState("");

  useEffect(() => {
    const l1=document.createElement("link");l1.rel="preconnect";l1.href="https://fonts.googleapis.com";document.head.appendChild(l1);
    const l2=document.createElement("link");l2.rel="stylesheet";l2.href="https://fonts.googleapis.com/css2?family=Syne:wght@400;700;800&family=DM+Sans:wght@300;400;500;600&display=swap";document.head.appendChild(l2);
    const style=document.createElement("style");
    style.textContent=`*{box-sizing:border-box}body{margin:0}input:focus{border-color:rgba(245,158,11,0.6)!important;box-shadow:0 0 0 3px rgba(245,158,11,0.08)!important;outline:none!important}`;
    document.head.appendChild(style);
  }, []);

  const handleOperatorLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    try {
      const hash = await hashPassword(password);
      const { data, error: err } = await supabase
        .from('operator_accounts')
        .select('*')
        .eq('username', username.trim().toLowerCase())
        .eq('password_hash', hash)
        .eq('activo', true)
        .single();
      if (err || !data) { setError("Utilizador ou senha incorrectos."); setLoading(false); return; }
      onOperatorLogin(data);
    } catch { setError("Erro ao verificar credenciais."); }
    setLoading(false);
  };

  const handleAdminLogin = async (e) => {
    e.preventDefault();
    setLoading(true); setError("");
    const { error: err } = await supabase.auth.signInWithPassword({ email, password });
    if (err) { setError("Email ou senha incorrectos."); setLoading(false); }
    else onAdminLogin();
  };

  const inputStyle = {width:"100%",padding:"0.7rem 1rem",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",color:"#e2e8f0",fontSize:"0.88rem",fontFamily:"inherit",transition:"all 0.15s"};
  const labelStyle = {display:"block",color:"#475569",fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"7px"};

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",padding:"1rem"}}>
      <div style={{position:"fixed",top:"-20%",left:"50%",transform:"translateX(-50%)",width:"600px",height:"600px",background:"radial-gradient(circle,rgba(245,158,11,0.06) 0%,transparent 70%)",pointerEvents:"none"}}/>

      <div style={{width:"100%",maxWidth:"400px"}}>
        {/* Logo */}
        <div style={{textAlign:"center",marginBottom:"2rem"}}>
          <div style={{width:"56px",height:"56px",borderRadius:"16px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center",margin:"0 auto 1rem",boxShadow:"0 8px 24px rgba(245,158,11,0.3)"}}>
            <Icon name="fuel" size={26}/>
          </div>
          <div style={{color:"#f1f5f9",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"1.6rem",letterSpacing:"-0.03em"}}>FuelFlow</div>
          <div style={{color:"#334155",fontSize:"0.78rem",marginTop:"4px",textTransform:"uppercase",letterSpacing:"0.12em"}}>Gestão de Combustíveis</div>
        </div>

        {/* Mode toggle */}
        <div style={{display:"flex",gap:"4px",marginBottom:"1.5rem",background:"rgba(255,255,255,0.03)",padding:"4px",borderRadius:"12px"}}>
          {[["operador","⛽ Operador"],["admin","⚙️ Admin"]].map(([m,l])=>(
            <button key={m} onClick={()=>{setMode(m);setError("");}} style={{flex:1,padding:"0.6rem",borderRadius:"9px",border:"none",background:mode===m?"linear-gradient(135deg,#f59e0b,#d97706)":"transparent",color:mode===m?"#000":"#475569",fontWeight:mode===m?700:400,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit",transition:"all 0.15s"}}>
              {l}
            </button>
          ))}
        </div>

        {/* Card */}
        <div style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"20px",padding:"2rem",boxShadow:"0 24px 64px rgba(0,0,0,0.5)"}}>

          {mode==="operador" ? (
            <form onSubmit={handleOperatorLogin}>
              <div style={{marginBottom:"1rem"}}>
                <label style={labelStyle}>Utilizador</label>
                <input value={username} onChange={e=>setUsername(e.target.value)} required placeholder="ex: joao.silva" autoComplete="username" style={inputStyle}/>
              </div>
              <div style={{marginBottom:"1.5rem"}}>
                <label style={labelStyle}>Senha</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" style={inputStyle}/>
              </div>
              {error&&<div style={{padding:"0.7rem 1rem",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"10px",color:"#f87171",fontSize:"0.82rem",marginBottom:"1rem",textAlign:"center"}}>{error}</div>}
              <button type="submit" disabled={loading} style={{width:"100%",padding:"0.75rem",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#000",border:"none",borderRadius:"12px",fontWeight:700,fontSize:"0.9rem",cursor:loading?"wait":"pointer",opacity:loading?0.7:1,transition:"all 0.2s",boxShadow:"0 4px 16px rgba(245,158,11,0.25)",fontFamily:"inherit"}}>
                {loading?"A entrar...":"Entrar como Operador"}
              </button>
            </form>
          ) : (
            <form onSubmit={handleAdminLogin}>
              <div style={{marginBottom:"1rem"}}>
                <label style={labelStyle}>Email</label>
                <input type="email" value={email} onChange={e=>setEmail(e.target.value)} required placeholder="admin@email.com" autoComplete="email" style={inputStyle}/>
              </div>
              <div style={{marginBottom:"1.5rem"}}>
                <label style={labelStyle}>Senha</label>
                <input type="password" value={password} onChange={e=>setPassword(e.target.value)} required placeholder="••••••••" autoComplete="current-password" style={inputStyle}/>
              </div>
              {error&&<div style={{padding:"0.7rem 1rem",background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.2)",borderRadius:"10px",color:"#f87171",fontSize:"0.82rem",marginBottom:"1rem",textAlign:"center"}}>{error}</div>}
              <button type="submit" disabled={loading} style={{width:"100%",padding:"0.75rem",background:"linear-gradient(135deg,#475569,#334155)",color:"#fff",border:"none",borderRadius:"12px",fontWeight:700,fontSize:"0.9rem",cursor:loading?"wait":"pointer",opacity:loading?0.7:1,transition:"all 0.2s",fontFamily:"inherit"}}>
                {loading?"A entrar...":"Entrar como Admin"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// OPERATOR APP — Registo de Turno
// ════════════════════════════════════════════════════════════════════════════
function OperatorApp({ user, profile, onLogout }) {
  const [shift, setShift]         = useState(null);   // turno activo
  const [hoses, setHoses]         = useState([]);
  const [loadingData, setLoadingData] = useState(true);
  const [tab, setTab]             = useState("caixa"); // caixa | pedidos | contadores
  const [cashEntries, setCashEntries] = useState([]);
  const [shiftOrders, setShiftOrders] = useState([]);
  const [hoseReadings, setHoseReadings] = useState([]);
  const [saving, setSaving]       = useState(false);
  const [closingShift, setClosingShift] = useState(false);

  // Cash form
  const [cashForm, setCashForm]   = useState({ method:"Cash", type:"entrada", valor:"", notas:"" });
  // Order form
  const [orderForm, setOrderForm] = useState({ notas:"", photoFile:null, photoPreview:null });
  // Final readings for close
  const [finalReadings, setFinalReadings] = useState({});

  const METODOS = ["Cash","e-Mola","M-Pesa","POS BIM","POS STB","POS Moza","POS BCI"];
  const METODO_COLORS = {"Cash":"#f59e0b","e-Mola":"#10b981","M-Pesa":"#3b82f6","POS BIM":"#8b5cf6","POS STB":"#06b6d4","POS Moza":"#f43f5e","POS BCI":"#f97316"};

  useEffect(() => { loadOperatorData(); }, []);

  const loadOperatorData = async () => {
    setLoadingData(true);
    // Load hoses
    const { data: hosesData } = await supabase.from('hoses').select('*').order('numero');
    setHoses(hosesData || []);
    // Check for open shift today
    const today = new Date().toISOString().split("T")[0];
    const { data: shiftData } = await supabase
      .from('shifts')
      .select('*')
      .eq('operador_account_id', user.id)
      .eq('data', today)
      .eq('status', 'aberto')
      .single();
    if (shiftData) {
      setShift(shiftData);
      // Load existing entries
      const [{ data: ce }, { data: so }, { data: hr }] = await Promise.all([
        supabase.from('cash_entries').select('*').eq('turno_id', shiftData.id).order('created_at'),
        supabase.from('shift_orders').select('*').eq('turno_id', shiftData.id).order('created_at'),
        supabase.from('hose_readings').select('*').eq('turno_id', shiftData.id),
      ]);
      setCashEntries(ce || []);
      setShiftOrders(so || []);
      const readingsMap = {};
      (hr||[]).forEach(r => { readingsMap[r.mangueira_id] = r; });
      setHoseReadings(readingsMap);
      const finals = {};
      (hr||[]).forEach(r => { finals[r.mangueira_id] = r.leitura_final || ""; });
      setFinalReadings(finals);
    }
    setLoadingData(false);
  };

  // ── Abrir turno ───────────────────────────────────────────────────────
  const [startReadings, setStartReadings] = useState({});
  const [startingShift, setStartingShift] = useState(false);

  const openShift = async () => {
    setStartingShift(true);
    const today = new Date().toISOString().split("T")[0];
    const { data: newShift, error: shiftErr } = await supabase.from('shifts').insert({
      operador_id: null,
      operador_account_id: user.id,
      operador_nome: profile?.nome || user.username || user.nome,
      data: today,
      status: 'aberto',
      aberto_em: new Date().toISOString(),
    }).select().single();
    if (shiftErr) { console.error(shiftErr); alert("Erro ao iniciar turno: " + shiftErr.message); setStartingShift(false); return; }
    if (newShift) {
      for (const [hoseId, leitura] of Object.entries(startReadings)) {
        if (leitura) {
          await supabase.from('hose_readings').insert({
            turno_id: newShift.id,
            mangueira_id: parseInt(hoseId),
            leitura_inicial: parseFloat(leitura) || 0,
            leitura_final: null,
          });
        }
      }
      setShift(newShift);
      await loadOperatorData();
    }
    setStartingShift(false);
  };

  // ── Registar entrada/saída de caixa ──────────────────────────────────
  const saveCashEntry = async () => {
    if (!cashForm.valor || parseFloat(cashForm.valor) <= 0) return;
    setSaving(true);
    const { data } = await supabase.from('cash_entries').insert({
      turno_id: shift.id,
      metodo: cashForm.method,
      tipo: cashForm.type,
      valor: parseFloat(cashForm.valor),
      notas: cashForm.notas,
    }).select().single();
    if (data) setCashEntries(e => [...e, data]);
    setCashForm(f => ({ ...f, valor:"", notas:"" }));
    setSaving(false);
  };

  // ── Registar pedido com foto ──────────────────────────────────────────
  const handlePhoto = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => setOrderForm(f => ({ ...f, photoFile: file, photoPreview: ev.target.result }));
    reader.readAsDataURL(file);
  };

  const saveOrder = async () => {
    setSaving(true);
    let photoUrl = null;
    if (orderForm.photoFile) {
      const ext  = orderForm.photoFile.name.split('.').pop();
      const path = `pedidos/${shift.id}_${Date.now()}.${ext}`;
      const { data: up } = await supabase.storage.from('shift-photos').upload(path, orderForm.photoFile);
      if (up) {
        const { data: url } = supabase.storage.from('shift-photos').getPublicUrl(path);
        photoUrl = url?.publicUrl;
      }
    }
    const { data } = await supabase.from('shift_orders').insert({
      turno_id: shift.id,
      notas: orderForm.notas,
      foto_url: photoUrl,
    }).select().single();
    if (data) setShiftOrders(o => [...o, data]);
    setOrderForm({ notas:"", photoFile:null, photoPreview:null });
    setSaving(false);
  };

  // ── Salvar leituras finais ────────────────────────────────────────────
  const saveFinalReading = async (hoseId, value) => {
    setFinalReadings(r => ({ ...r, [hoseId]: value }));
    const existing = hoseReadings[hoseId];
    if (existing) {
      await supabase.from('hose_readings').update({ leitura_final: parseFloat(value)||0 }).eq('id', existing.id);
    }
  };

  // ── Fechar turno ──────────────────────────────────────────────────────
  const closeShift = async () => {
    setClosingShift(true);
    await supabase.from('shifts').update({
      status: 'fechado',
      fechado_em: new Date().toISOString(),
      total_entradas: cashEntries.filter(e=>e.tipo==='entrada').reduce((s,e)=>s+e.valor,0),
      total_saidas: cashEntries.filter(e=>e.tipo==='saida').reduce((s,e)=>s+e.valor,0),
    }).eq('id', shift.id);
    setShift(null); setCashEntries([]); setShiftOrders([]); setHoseReadings({}); setFinalReadings({});
    setClosingShift(false);
    alert("✅ Turno fechado com sucesso!");
  };

  // Totais
  const totalEntradas  = cashEntries.filter(e=>e.tipo==='entrada').reduce((s,e)=>s+e.valor,0);
  const totalSaidas    = cashEntries.filter(e=>e.tipo==='saida').reduce((s,e)=>s+e.valor,0);
  const saldoCaixa     = totalEntradas - totalSaidas;

  const byMethod = METODOS.map(m => ({
    m, total: cashEntries.filter(e=>e.tipo==='entrada'&&e.metodo===m).reduce((s,e)=>s+e.valor,0)
  })).filter(x=>x.total>0);

  if (loadingData) return (
    <div style={{background:"#060d18",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",color:"#475569"}}>
      A carregar...
    </div>
  );

  // ── SE não há turno aberto → Ecrã de início ──────────────────────────
  if (!shift) return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",color:"#e2e8f0",padding:"1.5rem",maxWidth:"520px",margin:"0 auto"}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"2rem"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:"32px",height:"32px",borderRadius:"10px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="fuel" size={15}/>
          </div>
          <div>
            <div style={{color:"#f1f5f9",fontFamily:"'Syne',sans-serif",fontWeight:700,fontSize:"0.9rem"}}>FuelFlow</div>
            <div style={{color:"#334155",fontSize:"0.65rem"}}>{profile?.nome || user.email}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{background:"rgba(239,68,68,0.08)",border:"1px solid rgba(239,68,68,0.15)",borderRadius:"8px",color:"#f87171",cursor:"pointer",padding:"0.4rem 0.8rem",fontSize:"0.75rem",fontWeight:600}}>Sair</button>
      </div>

      <div style={{textAlign:"center",padding:"1rem 0 2rem"}}>
        <div style={{fontSize:"2.5rem",marginBottom:"0.5rem"}}>⛽</div>
        <div style={{color:"#f1f5f9",fontWeight:700,fontSize:"1.1rem",fontFamily:"'Syne',sans-serif"}}>Iniciar Turno</div>
        <div style={{color:"#475569",fontSize:"0.82rem",marginTop:"4px"}}>{new Date().toLocaleDateString("pt-MZ",{weekday:"long",day:"numeric",month:"long"})}</div>
      </div>

      <div style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"16px",padding:"1.5rem",marginBottom:"1.2rem"}}>
        <div style={{color:"#64748b",fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"1rem"}}>Leituras Iniciais dos Contadores</div>
        {hoses.length === 0 && <div style={{color:"#475569",fontSize:"0.82rem",textAlign:"center",padding:"1rem"}}>Nenhuma mangueira configurada.<br/>Pede ao admin para configurar as mangueiras.</div>}
        {hoses.map(h => (
          <div key={h.id} style={{display:"flex",alignItems:"center",gap:"0.8rem",marginBottom:"0.8rem"}}>
            <div style={{width:"8px",height:"8px",borderRadius:"50%",background:h.cor||"#f59e0b",flexShrink:0}}/>
            <div style={{flex:1,color:"#cbd5e1",fontSize:"0.85rem",fontWeight:500}}>{h.nome} <span style={{color:"#475569",fontSize:"0.75rem"}}>({h.combustivel})</span></div>
            <input type="number" step="0.01" placeholder="0.00" value={startReadings[h.id]||""}
              onChange={e=>setStartReadings(r=>({...r,[h.id]:e.target.value}))}
              style={{width:"110px",padding:"0.5rem 0.8rem",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"8px",color:"#e2e8f0",fontSize:"0.85rem",textAlign:"right",fontFamily:"inherit",outline:"none"}}/>
            <span style={{color:"#475569",fontSize:"0.75rem"}}>L</span>
          </div>
        ))}
      </div>

      <button onClick={openShift} disabled={startingShift}
        style={{width:"100%",padding:"0.9rem",background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#000",border:"none",borderRadius:"12px",fontWeight:700,fontSize:"0.95rem",cursor:"pointer",boxShadow:"0 4px 16px rgba(245,158,11,0.3)",fontFamily:"inherit",opacity:startingShift?0.7:1}}>
        {startingShift?"A iniciar...":"▶ Iniciar Turno"}
      </button>
    </div>
  );

  // ── TURNO ACTIVO ─────────────────────────────────────────────────────
  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",color:"#e2e8f0",maxWidth:"560px",margin:"0 auto",padding:"1rem 1rem 6rem"}}>
      {/* Header */}
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:"1.2rem",padding:"0.2rem 0"}}>
        <div style={{display:"flex",alignItems:"center",gap:"10px"}}>
          <div style={{width:"32px",height:"32px",borderRadius:"10px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Icon name="fuel" size={15}/>
          </div>
          <div>
            <div style={{color:"#f1f5f9",fontWeight:700,fontSize:"0.88rem"}}>Turno Activo</div>
            <div style={{color:"#334155",fontSize:"0.68rem"}}>{profile?.nome||user.email} · {new Date().toLocaleDateString("pt-MZ")}</div>
          </div>
        </div>
        <button onClick={onLogout} style={{background:"transparent",border:"none",color:"#334155",cursor:"pointer",fontSize:"0.75rem"}}>Sair</button>
      </div>

      {/* Saldo rápido */}
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.6rem",marginBottom:"1.2rem"}}>
        {[
          {label:"Entradas",value:fmt(totalEntradas),color:"#34d399"},
          {label:"Saídas",  value:fmt(totalSaidas),  color:"#f87171"},
          {label:"Saldo",   value:fmt(saldoCaixa),   color:saldoCaixa>=0?"#60a5fa":"#f87171"},
        ].map(({label,value,color})=>(
          <div key={label} style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"12px",padding:"0.8rem 0.7rem",textAlign:"center"}}>
            <div style={{color:"#334155",fontSize:"0.65rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em"}}>{label}</div>
            <div style={{color,fontSize:"0.95rem",fontWeight:700,fontFamily:"'Syne',sans-serif",marginTop:"3px"}}>{value}</div>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div style={{display:"flex",gap:"4px",marginBottom:"1.2rem",background:"rgba(255,255,255,0.03)",padding:"4px",borderRadius:"12px"}}>
        {[["caixa","💰 Caixa"],["pedidos","📋 Pedidos"],["contadores","⛽ Contadores"]].map(([t,l])=>(
          <button key={t} onClick={()=>setTab(t)} style={{flex:1,padding:"0.55rem 0.3rem",borderRadius:"9px",border:"none",background:tab===t?"linear-gradient(135deg,#f59e0b,#d97706)":  "transparent",color:tab===t?"#000":"#475569",fontWeight:tab===t?700:400,fontSize:"0.75rem",cursor:"pointer",transition:"all 0.15s",fontFamily:"inherit"}}>
            {l}
          </button>
        ))}
      </div>

      {/* ── TAB: CAIXA ── */}
      {tab==="caixa" && (
        <div>
          {/* Tipo entrada/saída */}
          <div style={{display:"flex",gap:"6px",marginBottom:"0.8rem"}}>
            {[["entrada","Entrada","#34d399"],["saida","Saída","#f87171"]].map(([v,l,c])=>(
              <button key={v} onClick={()=>setCashForm(f=>({...f,type:v}))} style={{flex:1,padding:"0.6rem",borderRadius:"10px",border:`1px solid`,borderColor:cashForm.type===v?c+"50":"rgba(255,255,255,0.06)",background:cashForm.type===v?c+"12":"transparent",color:cashForm.type===v?c:"#475569",fontWeight:600,fontSize:"0.82rem",cursor:"pointer",fontFamily:"inherit"}}>
                {cashForm.type===v?(v==="entrada"?"▲ ":"▼ "):""}{l}
              </button>
            ))}
          </div>

          {/* Método */}
          <div style={{marginBottom:"0.8rem"}}>
            <div style={{color:"#475569",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px"}}>Método</div>
            <div style={{display:"flex",flexWrap:"wrap",gap:"5px"}}>
              {METODOS.map(m=>(
                <button key={m} onClick={()=>setCashForm(f=>({...f,method:m}))} style={{padding:"5px 10px",borderRadius:"8px",border:"1px solid",borderColor:cashForm.method===m?(METODO_COLORS[m]||"#f59e0b")+"50":"rgba(255,255,255,0.06)",background:cashForm.method===m?(METODO_COLORS[m]||"#f59e0b")+"12":"transparent",color:cashForm.method===m?METODO_COLORS[m]||"#f59e0b":"#475569",fontSize:"0.76rem",fontWeight:600,cursor:"pointer",fontFamily:"inherit"}}>
                  {m}
                </button>
              ))}
            </div>
          </div>

          {/* Valor + Notas */}
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.6rem",marginBottom:"0.8rem"}}>
            <div>
              <div style={{color:"#475569",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px"}}>Valor (MT) *</div>
              <input type="number" step="0.01" placeholder="0.00" value={cashForm.valor}
                onChange={e=>setCashForm(f=>({...f,valor:e.target.value}))}
                style={{width:"100%",padding:"0.65rem 0.9rem",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",color:"#e2e8f0",fontSize:"0.95rem",fontWeight:600,fontFamily:"inherit",outline:"none"}}/>
            </div>
            <div>
              <div style={{color:"#475569",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"6px"}}>Notas</div>
              <input type="text" placeholder="Opcional" value={cashForm.notas}
                onChange={e=>setCashForm(f=>({...f,notas:e.target.value}))}
                style={{width:"100%",padding:"0.65rem 0.9rem",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",color:"#e2e8f0",fontSize:"0.85rem",fontFamily:"inherit",outline:"none"}}/>
            </div>
          </div>

          <button onClick={saveCashEntry} disabled={saving||!cashForm.valor}
            style={{width:"100%",padding:"0.75rem",background:cashForm.type==="entrada"?"linear-gradient(135deg,#10b981,#059669)":"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",border:"none",borderRadius:"12px",fontWeight:700,fontSize:"0.88rem",cursor:"pointer",fontFamily:"inherit",marginBottom:"1.5rem",opacity:!cashForm.valor||saving?0.5:1}}>
            {saving?"A guardar...":`${cashForm.type==="entrada"?"▲ Registar Entrada":"▼ Registar Saída"} · ${fmt(parseFloat(cashForm.valor)||0)} MT`}
          </button>

          {/* Resumo por método */}
          {byMethod.length > 0 && (
            <div style={{marginBottom:"1.2rem"}}>
              <div style={{color:"#334155",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.6rem"}}>Entradas por Método</div>
              {byMethod.map(({m,total})=>(
                <div key={m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 0.8rem",marginBottom:"4px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:"1px solid rgba(255,255,255,0.03)"}}>
                  <span style={{color:METODO_COLORS[m]||"#94a3b8",fontSize:"0.82rem",fontWeight:600}}>{m}</span>
                  <span style={{color:"#e2e8f0",fontSize:"0.85rem",fontWeight:600}}>{fmt(total)} MT</span>
                </div>
              ))}
            </div>
          )}

          {/* Histórico */}
          {cashEntries.length > 0 && (
            <div>
              <div style={{color:"#334155",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.6rem"}}>Histórico do Turno ({cashEntries.length})</div>
              {[...cashEntries].reverse().map(e=>(
                <div key={e.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 0.8rem",marginBottom:"4px",background:"rgba(255,255,255,0.02)",borderRadius:"8px",border:`1px solid ${e.tipo==="entrada"?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)"}`}}>
                  <div>
                    <div style={{color:"#e2e8f0",fontSize:"0.82rem",fontWeight:500}}>{e.metodo}{e.notas&&<span style={{color:"#334155"}}> · {e.notas}</span>}</div>
                  </div>
                  <div style={{color:e.tipo==="entrada"?"#34d399":"#f87171",fontWeight:700,fontSize:"0.88rem"}}>
                    {e.tipo==="entrada"?"+":"-"}{fmt(e.valor)} MT
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── TAB: PEDIDOS ── */}
      {tab==="pedidos" && (
        <div>
          <div style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"14px",padding:"1.2rem",marginBottom:"1rem"}}>
            <div style={{color:"#64748b",fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"0.8rem"}}>Registar Pedido / Requisição</div>

            {/* Foto */}
            <div style={{marginBottom:"0.8rem"}}>
              {orderForm.photoPreview ? (
                <div style={{position:"relative"}}>
                  <img src={orderForm.photoPreview} alt="preview" style={{width:"100%",maxHeight:"180px",objectFit:"cover",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.06)"}}/>
                  <button onClick={()=>setOrderForm(f=>({...f,photoFile:null,photoPreview:null}))}
                    style={{position:"absolute",top:"8px",right:"8px",background:"rgba(0,0,0,0.7)",border:"none",borderRadius:"50%",color:"#fff",width:"28px",height:"28px",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:"0.8rem"}}>✕</button>
                </div>
              ) : (
                <label style={{display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"6px",padding:"1.5rem",background:"rgba(255,255,255,0.02)",border:"1px dashed rgba(255,255,255,0.1)",borderRadius:"10px",cursor:"pointer"}}>
                  <span style={{fontSize:"1.8rem"}}>📷</span>
                  <span style={{color:"#475569",fontSize:"0.8rem"}}>Tirar foto / Escolher imagem</span>
                  <input type="file" accept="image/*" capture="environment" onChange={handlePhoto} style={{display:"none"}}/>
                </label>
              )}
            </div>

            {/* Notas */}
            <div style={{marginBottom:"0.8rem"}}>
              <textarea value={orderForm.notas} onChange={e=>setOrderForm(f=>({...f,notas:e.target.value}))}
                placeholder="Notas do pedido (nº requisição, cliente, observações...)" rows={3}
                style={{width:"100%",padding:"0.65rem 0.9rem",background:"rgba(255,255,255,0.03)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:"10px",color:"#e2e8f0",fontSize:"0.85rem",fontFamily:"inherit",resize:"vertical",outline:"none"}}/>
            </div>

            <button onClick={saveOrder} disabled={saving||(!orderForm.notas&&!orderForm.photoFile)}
              style={{width:"100%",padding:"0.7rem",background:"linear-gradient(135deg,#3b82f6,#2563eb)",color:"#fff",border:"none",borderRadius:"10px",fontWeight:600,fontSize:"0.85rem",cursor:"pointer",fontFamily:"inherit",opacity:(!orderForm.notas&&!orderForm.photoFile)||saving?0.5:1}}>
              {saving?"A guardar...":"📋 Guardar Pedido"}
            </button>
          </div>

          {/* Lista pedidos */}
          {shiftOrders.length === 0 && <div style={{textAlign:"center",padding:"2rem",color:"#334155",fontSize:"0.82rem"}}>Nenhum pedido registado ainda</div>}
          {[...shiftOrders].reverse().map(o=>(
            <div key={o.id} style={{background:"rgba(255,255,255,0.02)",border:"1px solid rgba(255,255,255,0.05)",borderRadius:"12px",overflow:"hidden",marginBottom:"0.6rem"}}>
              {o.foto_url && <img src={o.foto_url} alt="pedido" style={{width:"100%",maxHeight:"140px",objectFit:"cover"}} onClick={()=>window.open(o.foto_url,'_blank')}/>}
              {o.notas && <div style={{padding:"0.7rem 0.9rem",color:"#94a3b8",fontSize:"0.82rem"}}>{o.notas}</div>}
            </div>
          ))}
        </div>
      )}

      {/* ── TAB: CONTADORES ── */}
      {tab==="contadores" && (
        <div>
          <div style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"14px",padding:"1.2rem",marginBottom:"1rem"}}>
            <div style={{color:"#64748b",fontSize:"0.7rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.1em",marginBottom:"1rem"}}>Leituras Finais dos Contadores</div>
            {hoses.map(h=>{
              const reading = hoseReadings[h.id];
              const inicial = reading?.leitura_inicial ?? "—";
              const final_  = finalReadings[h.id] ?? "";
              const litros  = reading && final_ ? Math.max(0, parseFloat(final_) - parseFloat(inicial)) : null;
              return (
                <div key={h.id} style={{marginBottom:"1rem",padding:"0.9rem",background:"rgba(0,0,0,0.25)",borderRadius:"10px",border:"1px solid rgba(255,255,255,0.04)"}}>
                  <div style={{display:"flex",alignItems:"center",gap:"8px",marginBottom:"0.6rem"}}>
                    <div style={{width:"8px",height:"8px",borderRadius:"50%",background:h.cor||"#f59e0b"}}/>
                    <span style={{color:"#e2e8f0",fontSize:"0.85rem",fontWeight:600}}>{h.nome}</span>
                    <span style={{color:"#334155",fontSize:"0.75rem"}}>({h.combustivel})</span>
                  </div>
                  <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.6rem"}}>
                    <div>
                      <div style={{color:"#334155",fontSize:"0.65rem",marginBottom:"4px"}}>Inicial</div>
                      <div style={{color:"#60a5fa",fontSize:"0.9rem",fontWeight:600}}>{fmt(inicial)} L</div>
                    </div>
                    <div>
                      <div style={{color:"#334155",fontSize:"0.65rem",marginBottom:"4px"}}>Final</div>
                      <input type="number" step="0.01" placeholder="0.00" value={final_}
                        onChange={e=>saveFinalReading(h.id, e.target.value)}
                        style={{width:"100%",padding:"0.4rem 0.7rem",background:"rgba(255,255,255,0.04)",border:"1px solid rgba(255,255,255,0.1)",borderRadius:"8px",color:"#e2e8f0",fontSize:"0.88rem",fontFamily:"inherit",outline:"none"}}/>
                    </div>
                  </div>
                  {litros !== null && litros >= 0 && (
                    <div style={{marginTop:"0.5rem",padding:"0.4rem 0.7rem",background:"rgba(245,158,11,0.08)",borderRadius:"8px",color:"#fbbf24",fontSize:"0.82rem",fontWeight:600,textAlign:"center"}}>
                      ⛽ {fmt(litros)} L vendidos
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Botão fechar turno - fixo em baixo */}
      <div style={{position:"fixed",bottom:0,left:"50%",transform:"translateX(-50%)",width:"100%",maxWidth:"560px",padding:"1rem",background:"linear-gradient(to top,#060d18 70%,transparent)",zIndex:100}}>
        <button onClick={()=>{ if(window.confirm("Tens a certeza que queres fechar o turno?")) closeShift(); }}
          disabled={closingShift}
          style={{width:"100%",padding:"0.85rem",background:"linear-gradient(135deg,#ef4444,#dc2626)",color:"#fff",border:"none",borderRadius:"12px",fontWeight:700,fontSize:"0.9rem",cursor:"pointer",fontFamily:"inherit",boxShadow:"0 4px 16px rgba(239,68,68,0.3)",opacity:closingShift?0.7:1}}>
          {closingShift?"A fechar...":"🔒 Fechar Turno"}
        </button>
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GESTÃO DE MANGUEIRAS
// ════════════════════════════════════════════════════════════════════════════
function HosesAdmin() {
  const [hoses, setHoses]   = useState([]);
  const [modal, setModal]   = useState(false);
  const [form, setForm]     = useState({});
  const [loading, setLoading] = useState(true);

  const COMBUSTIVEIS = ["Gasolina","Diesel","Petróleo","Óleo Motor"];
  const CORES = ["#f59e0b","#3b82f6","#8b5cf6","#10b981","#f43f5e","#06b6d4","#f97316"];

  useEffect(() => { load(); }, []);
  const load = async () => { const { data } = await supabase.from('hoses').select('*').order('numero'); setHoses(data||[]); setLoading(false); };
  const openNew  = () => { setForm({ nome:"", combustivel:"Gasolina", numero:"", cor:"#f59e0b" }); setModal(true); };
  const openEdit = (h) => { setForm({...h}); setModal(true); };
  const handleSave = async () => {
    if (!form.nome) return;
    const { id, ...data } = form;
    if (id) { await supabase.from('hoses').update(data).eq('id',id); }
    else     { await supabase.from('hoses').insert(data); }
    setModal(false); load();
  };
  const handleDelete = async (id) => { if(window.confirm("Eliminar mangueira?")) { await supabase.from('hoses').delete().eq('id',id); load(); } };

  return (
    <div>
      <PageHeader title="Mangueiras / Bombas" sub="Configura as mangueiras para os operadores"
        action={<Btn onClick={openNew} icon="plus">Nova Mangueira</Btn>}/>
      <Card>
        {loading ? <div style={{padding:"2rem",textAlign:"center",color:"#475569"}}>A carregar...</div> : (
          <Table headers={["Nº","Nome","Combustível","Cor","Ações"]}>
            {hoses.map(h=>(
              <TR key={h.id}>
                <TD bold>{h.numero||"—"}</TD>
                <TD><div style={{display:"flex",alignItems:"center",gap:"8px"}}><div style={{width:"10px",height:"10px",borderRadius:"50%",background:h.cor}}/>{h.nome}</div></TD>
                <TD>{h.combustivel}</TD>
                <TD><div style={{width:"24px",height:"24px",borderRadius:"6px",background:h.cor,border:"1px solid rgba(255,255,255,0.1)"}}/></TD>
                <TD><div style={{display:"flex",gap:"5px"}}>
                  <IconBtn onClick={()=>openEdit(h)} icon="edit" color="#f59e0b"/>
                  <IconBtn onClick={()=>handleDelete(h.id)} icon="trash" color="#f87171"/>
                </div></TD>
              </TR>
            ))}
          </Table>
        )}
        {!loading&&hoses.length===0&&<div style={{padding:"3rem",textAlign:"center",color:"#475569"}}>Nenhuma mangueira. Clica em "Nova Mangueira" para começar.</div>}
      </Card>
      {modal&&(
        <Modal title={form.id?"Editar Mangueira":"Nova Mangueira"} onClose={()=>setModal(false)}>
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"1rem"}}>
            <Field label="Nome *"><Input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="ex: Mangueira 1"/></Field>
            <Field label="Nº Bomba"><Input value={form.numero||""} onChange={e=>setForm(f=>({...f,numero:e.target.value}))} placeholder="1"/></Field>
          </div>
          <Field label="Combustível">
            <Select value={form.combustivel||"Gasolina"} onChange={e=>setForm(f=>({...f,combustivel:e.target.value}))}>
              {COMBUSTIVEIS.map(c=><option key={c} value={c}>{c}</option>)}
            </Select>
          </Field>
          <Field label="Cor">
            <div style={{display:"flex",gap:"8px",flexWrap:"wrap"}}>
              {CORES.map(c=>(
                <button key={c} onClick={()=>setForm(f=>({...f,cor:c}))}
                  style={{width:"32px",height:"32px",borderRadius:"8px",background:c,border:`2px solid ${form.cor===c?"#fff":"transparent"}`,cursor:"pointer"}}/>
              ))}
            </div>
          </Field>
          <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={()=>setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSave} icon="save">Guardar</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — GESTÃO DE UTILIZADORES
// ════════════════════════════════════════════════════════════════════════════
function UsersAdmin({ currentUser }) {
  const [operators, setOperators] = useState([]);
  const [modal, setModal]         = useState(false);
  const [form, setForm]           = useState({});
  const [saving, setSaving]       = useState(false);
  const [loading, setLoading]     = useState(true);
  const [showPass, setShowPass]   = useState({});

  useEffect(() => { load(); }, []);
  const load = async () => {
    const { data } = await supabase.from('operator_accounts').select('*').order('nome');
    setOperators(data||[]); setLoading(false);
  };

  const openNew  = () => { setForm({ nome:"", username:"", password:"", activo:true }); setModal(true); };
  const openEdit = (op) => { setForm({ ...op, password:"" }); setModal(true); };

  const handleSave = async () => {
    if (!form.nome || !form.username) return;
    setSaving(true);
    const username = form.username.trim().toLowerCase().replace(/\s+/g, ".");
    // Check duplicate username
    if (!form.id) {
      const { data: existing } = await supabase.from('operator_accounts').select('id').eq('username', username).single();
      if (existing) { alert(`O utilizador "${username}" já existe.`); setSaving(false); return; }
    }
    const payload = { nome: form.nome, username, activo: form.activo ?? true };
    if (form.password) {
      payload.password_hash = await hashPassword(form.password);
    }
    if (form.id) {
      await supabase.from('operator_accounts').update(payload).eq('id', form.id);
    } else {
      if (!form.password) { alert("Define uma senha para o operador."); setSaving(false); return; }
      await supabase.from('operator_accounts').insert(payload);
    }
    setSaving(false); setModal(false); load();
  };

  const toggleActive = async (op) => {
    await supabase.from('operator_accounts').update({ activo: !op.activo }).eq('id', op.id);
    load();
  };

  const handleDelete = async (id) => {
    if (!window.confirm("Eliminar este operador?")) return;
    await supabase.from('operator_accounts').delete().eq('id', id);
    load();
  };

  return (
    <div>
      <PageHeader title="Operadores" sub="Gere os acessos dos operadores de turno"
        action={<Btn onClick={openNew} icon="plus">Novo Operador</Btn>}/>

      <Card>
        {loading ? <div style={{padding:"2rem",textAlign:"center",color:"#475569"}}>A carregar...</div> : (
          <Table headers={["Nome","Utilizador","Estado","Ações"]}>
            {operators.map(op=>(
              <TR key={op.id}>
                <TD bold>{op.nome}</TD>
                <TD><span style={{fontFamily:"monospace",background:"rgba(255,255,255,0.04)",padding:"2px 8px",borderRadius:"6px",color:"#94a3b8",fontSize:"0.82rem"}}>@{op.username}</span></TD>
                <TD>
                  <button onClick={()=>toggleActive(op)} style={{padding:"3px 10px",borderRadius:"999px",border:"none",cursor:"pointer",fontSize:"0.72rem",fontWeight:700,background:op.activo?"rgba(52,211,153,0.1)":"rgba(248,113,113,0.1)",color:op.activo?"#34d399":"#f87171",border:`1px solid ${op.activo?"rgba(52,211,153,0.2)":"rgba(248,113,113,0.2)"}`}}>
                    {op.activo?"Activo":"Inactivo"}
                  </button>
                </TD>
                <TD><div style={{display:"flex",gap:"5px"}}>
                  <IconBtn onClick={()=>openEdit(op)} icon="edit" color="#f59e0b" title="Editar"/>
                  <IconBtn onClick={()=>handleDelete(op.id)} icon="trash" color="#f87171" title="Eliminar"/>
                </div></TD>
              </TR>
            ))}
          </Table>
        )}
        {!loading&&operators.length===0&&(
          <div style={{padding:"3rem",textAlign:"center",color:"#475569"}}>
            Nenhum operador criado ainda.<br/>
            <span style={{fontSize:"0.8rem"}}>Clica em "Novo Operador" para adicionar.</span>
          </div>
        )}
      </Card>

      {modal&&(
        <Modal title={form.id?"Editar Operador":"Novo Operador"} onClose={()=>setModal(false)}>
          <Field label="Nome completo *">
            <Input value={form.nome||""} onChange={e=>setForm(f=>({...f,nome:e.target.value}))} placeholder="ex: João Silva"/>
          </Field>
          <Field label="Utilizador (username) *">
            <div style={{position:"relative"}}>
              <span style={{position:"absolute",left:"0.9rem",top:"50%",transform:"translateY(-50%)",color:"#475569",fontSize:"0.88rem"}}>@</span>
              <Input value={form.username||""} onChange={e=>setForm(f=>({...f,username:e.target.value.toLowerCase().replace(/\s+/g,".")}))}
                placeholder="joao.silva" style={{paddingLeft:"1.8rem"}}/>
            </div>
            <div style={{color:"#334155",fontSize:"0.7rem",marginTop:"4px"}}>Apenas letras minúsculas, números e pontos</div>
          </Field>
          <Field label={form.id?"Nova Senha (deixa vazio para manter)":"Senha *"}>
            <div style={{position:"relative"}}>
              <Input type={showPass[form.id||"new"]?"text":"password"} value={form.password||""}
                onChange={e=>setForm(f=>({...f,password:e.target.value}))}
                placeholder={form.id?"••••••••":"Mínimo 4 caracteres"}/>
              <button type="button" onClick={()=>setShowPass(s=>({...s,[form.id||"new"]:!s[form.id||"new"]}))}
                style={{position:"absolute",right:"0.8rem",top:"50%",transform:"translateY(-50%)",background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:"0.8rem"}}>
                {showPass[form.id||"new"]?"🙈":"👁️"}
              </button>
            </div>
          </Field>
          <div style={{display:"flex",alignItems:"center",gap:"0.7rem",padding:"0.7rem 0"}}>
            <button type="button" onClick={()=>setForm(f=>({...f,activo:!f.activo}))}
              style={{width:"36px",height:"20px",borderRadius:"999px",border:"none",cursor:"pointer",background:form.activo?"#f59e0b":"#1e293b",position:"relative",transition:"background 0.2s",flexShrink:0}}>
              <div style={{position:"absolute",top:"2px",left:form.activo?"18px":"2px",width:"16px",height:"16px",borderRadius:"50%",background:"#fff",transition:"left 0.2s"}}/>
            </button>
            <span style={{color:"#94a3b8",fontSize:"0.83rem"}}>Conta activa</span>
          </div>
          <div style={{display:"flex",gap:"0.8rem",justifyContent:"flex-end",marginTop:"1rem"}}>
            <Btn onClick={()=>setModal(false)} variant="secondary">Cancelar</Btn>
            <Btn onClick={handleSave} icon="save" disabled={saving}>{saving?"A guardar...":"Guardar"}</Btn>
          </div>
        </Modal>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// ADMIN — TURNOS
// ════════════════════════════════════════════════════════════════════════════
function TurnosAdmin() {
  const [shifts, setShifts]     = useState([]);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail]     = useState(null);
  const [loading, setLoading]   = useState(true);
  const [dateFilter, setDateFilter] = useState("");

  useEffect(() => { load(); }, []);

  const load = async () => {
    const q = supabase.from('shifts').select('*').order('data', {ascending:false}).order('aberto_em',{ascending:false});
    const { data } = await q;
    setShifts(data||[]);
    setLoading(false);
  };

  const loadDetail = async (shift) => {
    setSelected(shift);
    const [{ data: ce }, { data: so }, { data: hr }] = await Promise.all([
      supabase.from('cash_entries').select('*').eq('turno_id', shift.id).order('created_at'),
      supabase.from('shift_orders').select('*').eq('turno_id', shift.id).order('created_at'),
      supabase.from('hose_readings').select('*, hoses(nome,combustivel,cor)').eq('turno_id', shift.id),
    ]);
    setDetail({ cashEntries: ce||[], shiftOrders: so||[], hoseReadings: hr||[] });
  };

  const METODOS = ["Cash","e-Mola","M-Pesa","POS BIM","POS STB","POS Moza","POS BCI"];
  const METODO_COLORS = {"Cash":"#f59e0b","e-Mola":"#10b981","M-Pesa":"#3b82f6","POS BIM":"#8b5cf6","POS STB":"#06b6d4","POS Moza":"#f43f5e","POS BCI":"#f97316"};

  const filtered = dateFilter ? shifts.filter(s=>s.data===dateFilter) : shifts;

  return (
    <div>
      <PageHeader title="Turnos" sub="Registo diário dos operadores"/>

      <div style={{display:"flex",gap:"0.8rem",marginBottom:"1.2rem",alignItems:"center",flexWrap:"wrap"}}>
        <div style={{display:"flex",alignItems:"center",gap:"0.6rem",background:C.bg,border:C.border,borderRadius:"10px",padding:"0.5rem 0.9rem"}}>
          <Icon name="search" size={14}/>
          <input type="date" value={dateFilter} onChange={e=>setDateFilter(e.target.value)}
            style={{background:"none",border:"none",outline:"none",color:"#e2e8f0",fontSize:"0.85rem",fontFamily:"inherit"}}/>
        </div>
        {dateFilter&&<button onClick={()=>setDateFilter("")} style={{background:"none",border:"none",color:"#475569",cursor:"pointer",fontSize:"0.8rem"}}>✕ Limpar</button>}
      </div>

      {selected && detail ? (
        <div>
          <button onClick={()=>{setSelected(null);setDetail(null);}} style={{background:"rgba(245,158,11,0.06)",border:"1px solid rgba(245,158,11,0.15)",borderRadius:"8px",color:"#f59e0b",cursor:"pointer",display:"flex",alignItems:"center",gap:"6px",marginBottom:"1.5rem",fontSize:"0.8rem",fontWeight:600,padding:"0.4rem 0.9rem"}}>
            <Icon name="collapse" size={14}/> Voltar aos Turnos
          </button>

          {/* Header */}
          <div style={{background:"linear-gradient(145deg,#0d1b2e,#091422)",border:"1px solid rgba(255,255,255,0.06)",borderRadius:"16px",padding:"1.4rem",marginBottom:"1.2rem"}}>
            <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start",marginBottom:"1rem"}}>
              <div>
                <div style={{color:"#f1f5f9",fontWeight:700,fontSize:"0.95rem"}}>{selected.operador_nome}</div>
                <div style={{color:"#475569",fontSize:"0.78rem",marginTop:"2px"}}>{fmtDate(selected.data)} · Aberto: {selected.aberto_em?new Date(selected.aberto_em).toLocaleTimeString("pt-MZ",{hour:"2-digit",minute:"2-digit"}):"—"}</div>
              </div>
              <Badge status={selected.status==="aberto"?"pendente":"pago"}/>
            </div>
            <div style={{display:"grid",gridTemplateColumns:"1fr 1fr 1fr",gap:"0.6rem"}}>
              {[
                {l:"Entradas",v:fmt(detail.cashEntries.filter(e=>e.tipo==="entrada").reduce((s,e)=>s+e.valor,0)),c:"#34d399"},
                {l:"Saídas",  v:fmt(detail.cashEntries.filter(e=>e.tipo==="saida").reduce((s,e)=>s+e.valor,0)),  c:"#f87171"},
                {l:"Pedidos", v:detail.shiftOrders.length,c:"#60a5fa"},
              ].map(({l,v,c})=>(
                <div key={l} style={{textAlign:"center",padding:"0.7rem",background:"rgba(0,0,0,0.25)",borderRadius:"10px"}}>
                  <div style={{color:"#334155",fontSize:"0.65rem",textTransform:"uppercase",letterSpacing:"0.08em"}}>{l}</div>
                  <div style={{color:c,fontSize:"1rem",fontWeight:700,marginTop:"3px"}}>{v}{l!=="Pedidos"?" MT":""}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Contadores */}
          {detail.hoseReadings.length>0&&(
            <Card style={{marginBottom:"1.2rem"}}>
              <CardHeader title="Contadores / Mangueiras"/>
              <div style={{padding:"1rem 1.2rem"}}>
                {detail.hoseReadings.map(r=>{
                  const litros = r.leitura_final!=null ? Math.max(0,r.leitura_final-r.leitura_inicial) : null;
                  return (
                    <div key={r.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.6rem 0",borderBottom:C.borderFaint}}>
                      <div style={{display:"flex",alignItems:"center",gap:"8px"}}>
                        <div style={{width:"8px",height:"8px",borderRadius:"50%",background:r.hoses?.cor||"#f59e0b"}}/>
                        <span style={{color:"#e2e8f0",fontSize:"0.84rem"}}>{r.hoses?.nome} <span style={{color:"#334155"}}>({r.hoses?.combustivel})</span></span>
                      </div>
                      <div style={{textAlign:"right"}}>
                        <div style={{color:"#475569",fontSize:"0.72rem"}}>{fmt(r.leitura_inicial)} → {r.leitura_final!=null?fmt(r.leitura_final):"—"} L</div>
                        {litros!=null&&<div style={{color:"#fbbf24",fontWeight:600,fontSize:"0.82rem"}}>⛽ {fmt(litros)} L</div>}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {/* Entradas por método */}
          {detail.cashEntries.length>0&&(
            <Card style={{marginBottom:"1.2rem"}}>
              <CardHeader title="Movimentos de Caixa"/>
              <div style={{padding:"1rem 1.2rem"}}>
                {METODOS.map(m=>{
                  const ent = detail.cashEntries.filter(e=>e.tipo==="entrada"&&e.metodo===m).reduce((s,e)=>s+e.valor,0);
                  if (!ent) return null;
                  return (
                    <div key={m} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"0.55rem 0",borderBottom:C.borderFaint}}>
                      <span style={{color:METODO_COLORS[m],fontWeight:600,fontSize:"0.83rem"}}>{m}</span>
                      <span style={{color:"#e2e8f0",fontWeight:600,fontSize:"0.85rem"}}>{fmt(ent)} MT</span>
                    </div>
                  );
                })}
                {detail.cashEntries.filter(e=>e.tipo==="saida").length>0&&(
                  <div style={{marginTop:"0.8rem",paddingTop:"0.8rem",borderTop:C.borderFaint}}>
                    <div style={{color:"#334155",fontSize:"0.68rem",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.08em",marginBottom:"0.5rem"}}>Saídas</div>
                    {detail.cashEntries.filter(e=>e.tipo==="saida").map(e=>(
                      <div key={e.id} style={{display:"flex",justifyContent:"space-between",padding:"0.4rem 0",borderBottom:C.borderFaint}}>
                        <span style={{color:"#94a3b8",fontSize:"0.82rem"}}>{e.metodo}{e.notas&&` · ${e.notas}`}</span>
                        <span style={{color:"#f87171",fontWeight:600,fontSize:"0.82rem"}}>-{fmt(e.valor)} MT</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Card>
          )}

          {/* Pedidos */}
          {detail.shiftOrders.length>0&&(
            <Card>
              <CardHeader title={`Pedidos (${detail.shiftOrders.length})`}/>
              <div style={{padding:"1rem 1.2rem",display:"grid",gridTemplateColumns:"repeat(auto-fill,minmax(200px,1fr))",gap:"0.8rem"}}>
                {detail.shiftOrders.map(o=>(
                  <div key={o.id} style={{background:"rgba(0,0,0,0.25)",borderRadius:"10px",overflow:"hidden",border:C.borderFaint}}>
                    {o.foto_url&&<img src={o.foto_url} alt="pedido" style={{width:"100%",height:"130px",objectFit:"cover",cursor:"pointer"}} onClick={()=>window.open(o.foto_url,'_blank')}/>}
                    {o.notas&&<div style={{padding:"0.6rem 0.7rem",color:"#94a3b8",fontSize:"0.78rem"}}>{o.notas}</div>}
                    {o.foto_url&&<div style={{padding:"0 0.7rem 0.6rem"}}>
                      <a href={o.foto_url} download target="_blank" rel="noreferrer" style={{color:"#60a5fa",fontSize:"0.72rem",textDecoration:"none",fontWeight:600}}>⬇ Descarregar foto</a>
                    </div>}
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      ) : (
        <Card>
          {loading ? <div style={{padding:"2rem",textAlign:"center",color:"#475569"}}>A carregar...</div> : (
            <Table headers={["Data","Operador","Estado","Entradas","Saídas","Pedidos",""]}>
              {filtered.map(s=>{
                const isOpen = s.status==="aberto";
                return (
                  <TR key={s.id}>
                    <TD muted>{fmtDate(s.data)}</TD>
                    <TD bold>{s.operador_nome||"—"}</TD>
                    <TD><span style={{padding:"3px 9px",borderRadius:"999px",fontSize:"0.68rem",fontWeight:700,background:isOpen?"rgba(245,158,11,0.1)":"rgba(52,211,153,0.1)",color:isOpen?"#fbbf24":"#34d399",border:`1px solid ${isOpen?"rgba(245,158,11,0.2)":"rgba(52,211,153,0.2)"}`}}>{isOpen?"Aberto":"Fechado"}</span></TD>
                    <TD right style={{color:"#34d399"}}>{s.total_entradas?`${fmt(s.total_entradas)} MT`:"—"}</TD>
                    <TD right style={{color:"#f87171"}}>{s.total_saidas?`${fmt(s.total_saidas)} MT`:"—"}</TD>
                    <TD right muted>—</TD>
                    <TD><Btn small onClick={()=>loadDetail(s)} variant="ghost" icon="arrow">Ver</Btn></TD>
                  </TR>
                );
              })}
            </Table>
          )}
          {!loading&&filtered.length===0&&<div style={{padding:"3rem",textAlign:"center",color:"#475569"}}>Nenhum turno encontrado</div>}
        </Card>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════════════════════
// MAIN APP — com Auth + Supabase
// ════════════════════════════════════════════════════════════════════════════
export default function App() {
  const [user, setUser]               = useState(null);   // Supabase auth user (admin)
  const [profile, setProfile]         = useState(null);   // admin profile
  const [operatorSession, setOperatorSession] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('ff_operator') || 'null'); } catch { return null; }
  });
  const [authLoading, setAuthLoading] = useState(true);
  const [view, setView]                 = useState("dashboard");
  const [clients, setClients]           = useState([]);
  const [products, setProducts]         = useState([]);
  const [orders, setOrders]             = useState([]);
  const [payments, setPayments]         = useState([]);
  const [priceHistory, setPriceHistory] = useState([]);
  const [invoices, setInvoices]         = useState([]);
  const [sideOpen, setSideOpen]         = useState(true);
  const [payPreClient, setPayPreClient] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState(null);

  const loadAll = async () => {
    setLoading(true); setError(null);
    try {
      const [ {data:cls,error:e1},{data:prds,error:e2},{data:ords,error:e3},{data:pays,error:e4},{data:hist,error:e5},{data:invs,error:e6} ] = await Promise.all([
        supabase.from('clients').select('*').order('nome'),
        supabase.from('products').select('*').order('nome'),
        supabase.from('orders').select('*').order('data',{ascending:false}),
        supabase.from('payments').select('*').order('data',{ascending:false}),
        supabase.from('price_history').select('*').order('data',{ascending:false}),
        supabase.from('invoices').select('*').order('emitida_em',{ascending:false}),
      ]);
      if (e1||e2||e3||e4||e5||e6) throw (e1||e2||e3||e4||e5||e6);
      setClients(cls||[]); setProducts(prds||[]); setOrders(ords||[]); setPayments(pays||[]); setPriceHistory(hist||[]); setInvoices(invs||[]);
    } catch(err) { setError(err.message); }
    finally { setLoading(false); }
  };

  useEffect(() => {
    setupFonts();
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session?.user) { setUser(session.user); loadProfile(session.user.id); }
      else { setUser(null); setProfile(null); setAuthLoading(false); }
    });
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (user && profile && profile.role === 'admin') loadAll();
  }, [user, profile]);

  const loadProfile = async (userId) => {
    try {
      const { data, error } = await supabase.from('profiles').select('*').eq('id', userId).single();
      if (data && !error) {
        setProfile(data);
      } else {
        // Tabela não existe ou perfil não encontrado — tenta criar
        try {
          const { data: { user: authUser } } = await supabase.auth.getUser();
          const { data: newProfile } = await supabase.from('profiles').insert({
            id: userId,
            email: authUser?.email || '',
            nome: authUser?.email?.split('@')[0] || '',
            role: 'operador',
          }).select().single();
          setProfile(newProfile || { id: userId, role: 'operador' });
        } catch {
          // Se tabela não existe, assume operador para segurança
          setProfile({ id: userId, role: 'operador' });
        }
      }
    } catch {
      setProfile({ id: userId, role: 'operador' });
    }
    setAuthLoading(false);
  };

  const handleLogout = async () => {
    if (operatorSession) {
      sessionStorage.removeItem('ff_operator');
      setOperatorSession(null);
    } else {
      await supabase.auth.signOut();
      setUser(null); setProfile(null);
    }
  };

  const handleOperatorLogin = (opData) => {
    sessionStorage.setItem('ff_operator', JSON.stringify(opData));
    setOperatorSession(opData);
  };

  const setupFonts = () => {
    const l1=document.createElement("link");l1.rel="preconnect";l1.href="https://fonts.googleapis.com";document.head.appendChild(l1);
    const l2=document.createElement("link");l2.rel="stylesheet";l2.href="https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap";document.head.appendChild(l2);
    const style=document.createElement("style");
    style.textContent=`
      *{box-sizing:border-box}
      ::-webkit-scrollbar{width:4px;height:4px}
      ::-webkit-scrollbar-track{background:transparent}
      ::-webkit-scrollbar-thumb{background:rgba(255,255,255,0.08);border-radius:99px}
      ::-webkit-scrollbar-thumb:hover{background:rgba(255,255,255,0.15)}
      button{transition:all 0.16s cubic-bezier(.4,0,.2,1)!important;font-family:inherit!important}
      button:not(:disabled):active{transform:scale(0.96)!important}
      input,select,textarea{transition:border-color 0.15s,box-shadow 0.15s!important}
      input:focus,select:focus,textarea:focus{border-color:rgba(245,158,11,0.6)!important;box-shadow:0 0 0 3px rgba(245,158,11,0.08)!important;outline:none!important}
      .nav-btn{transition:all 0.15s!important}
      .nav-btn:not(.active):hover{background:rgba(255,255,255,0.04)!important;color:#94a3b8!important}
      .stat-card{transition:transform 0.2s cubic-bezier(.4,0,.2,1),box-shadow 0.2s}
      .stat-card:hover{transform:translateY(-3px);box-shadow:0 16px 48px rgba(0,0,0,0.5)!important}
      .tr-hover:hover td{background:rgba(255,255,255,0.025)!important;transition:background 0.1s}
      .btn-primary{box-shadow:0 2px 12px rgba(245,158,11,0.2)}
      .btn-primary:hover:not(:disabled){box-shadow:0 4px 20px rgba(245,158,11,0.35)!important;filter:brightness(1.06)}
      .modal-overlay{animation:fadeIn 0.18s ease}
      .modal-box{animation:slideUp 0.22s cubic-bezier(.34,1.56,.64,1)}
      @keyframes fadeIn{from{opacity:0}to{opacity:1}}
      @keyframes slideUp{from{opacity:0;transform:translateY(16px) scale(0.98)}to{opacity:1;transform:translateY(0) scale(1)}}
    `;
    document.head.appendChild(style);
  };

  // ── Operador logado via username ──────────────────────────────────────
  if (operatorSession) return <OperatorApp user={operatorSession} profile={operatorSession} onLogout={handleLogout}/>;

  // ── Loading auth ──────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{background:"#060d18",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"1.5rem",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:"48px",height:"48px",borderRadius:"14px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(245,158,11,0.35)"}}>
        <Icon name="fuel" size={24}/>
      </div>
      <div style={{color:"#334155",fontSize:"0.8rem"}}>A verificar sessão...</div>
    </div>
  );

  // ── Não autenticado → Login ───────────────────────────────────────────
  if (!user) return <LoginScreen
    onAdminLogin={()=>supabase.auth.getSession().then(({data:{session}})=>{if(session?.user){setUser(session.user);loadProfile(session.user.id);}})}
    onOperatorLogin={handleOperatorLogin}
  />;

  // ── Aguardar perfil ───────────────────────────────────────────────────
  if (!profile) return (
    <div style={{background:"#060d18",minHeight:"100vh",display:"flex",alignItems:"center",justifyContent:"center",fontFamily:"'DM Sans',sans-serif",color:"#334155",fontSize:"0.8rem"}}>
      A carregar perfil...
    </div>
  );

  // ── Admin → App completo ──────────────────────────────────────────────

  const saveClient  = async (c) => { const {id,...d}=c; if(clients.some(x=>x.id===id)){const{data:u}=await supabase.from('clients').update(d).eq('id',id).select().single();if(u)setClients(cs=>cs.map(x=>x.id===id?u:x));}else{const{data:cr}=await supabase.from('clients').insert(d).select().single();if(cr)setClients(cs=>[...cs,cr]);} };
  const delClient   = async (id) => { await supabase.from('clients').delete().eq('id',id); setClients(cs=>cs.filter(x=>x.id!==id)); };
  const saveProduct = async (p) => { const {id,...d}=p; if(products.some(x=>x.id===id)){const{data:u}=await supabase.from('products').update(d).eq('id',id).select().single();if(u)setProducts(ps=>ps.map(x=>x.id===id?u:x));}else{const{data:cr}=await supabase.from('products').insert(d).select().single();if(cr)setProducts(ps=>[...ps,cr]);} };
  const delProduct  = async (id) => { await supabase.from('products').delete().eq('id',id); setProducts(ps=>ps.filter(x=>x.id!==id)); };
  const addPriceH   = async (e) => { const{id,...d}=e; const{data:cr}=await supabase.from('price_history').insert(d).select().single(); if(cr)setPriceHistory(h=>[cr,...h]); };
  const saveOrder   = async (o) => { const{id,valorPago,valorDivida,estadoPag,...d}=o; if(orders.some(x=>x.id===id)){const{data:u}=await supabase.from('orders').update(d).eq('id',id).select().single();if(u)setOrders(os=>os.map(x=>x.id===id?u:x));}else{const{data:cr}=await supabase.from('orders').insert(d).select().single();if(cr)setOrders(os=>[cr,...os]);} };
  const delOrder    = async (id) => { await supabase.from('orders').delete().eq('id',id); setOrders(os=>os.filter(x=>x.id!==id)); };
  const savePayment = async (p) => { const{id,...d}=p; const{data:cr}=await supabase.from('payments').insert(d).select().single(); if(cr){setPayments(ps=>[cr,...ps]);setPayPreClient(null);} };
  const delPayment  = async (id) => { await supabase.from('payments').delete().eq('id',id); setPayments(ps=>ps.filter(x=>x.id!==id)); };
  const saveInvoice = async (i) => { const{id,...d}=i; const{data:cr}=await supabase.from('invoices').insert(d).select().single(); if(cr)setInvoices(is=>[cr,...is]); };
  const delInvoice  = async (id) => { await supabase.from('invoices').delete().eq('id',id); setInvoices(is=>is.filter(x=>x.id!==id)); };

  const navTo       = (v, cid) => { setPayPreClient(cid||null); setView(v); };
  const totalDivida = clients.reduce((s,c)=>{const{saldo}=calcSaldo(c.id,orders,payments);return saldo<0?s+Math.abs(saldo):s;},0);

  const navItems = [
    {id:"dashboard",label:"Dashboard",         icon:"dashboard"},
    {id:"clients",  label:"Clientes",          icon:"clients"},
    {id:"payments", label:"Pagamentos",        icon:"payments"},
    {id:"faturas",  label:"Faturas",           icon:"file"},
    {id:"products", label:"Produtos & Preços", icon:"products"},
    {id:"orders",   label:"Pedidos",           icon:"orders"},
    {id:"turnos",   label:"Turnos",            icon:"history"},
    {id:"mangueiras",label:"Mangueiras",       icon:"fuel"},
    {id:"users",    label:"Utilizadores",      icon:"clients"},
    {id:"reports",  label:"Relatórios",        icon:"reports"},
  ];

  if (loading) return (
    <div style={{background:"#060d18",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"1.5rem",fontFamily:"'DM Sans',sans-serif"}}>
      <div style={{width:"48px",height:"48px",borderRadius:"14px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center",boxShadow:"0 8px 24px rgba(245,158,11,0.35)"}}><Icon name="fuel" size={24}/></div>
      <div style={{color:"#f1f5f9",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"1.4rem",letterSpacing:"-0.02em"}}>FuelFlow</div>
      <div style={{width:"160px",height:"3px",background:"rgba(255,255,255,0.05)",borderRadius:"99px",overflow:"hidden"}}><div style={{height:"100%",width:"40%",background:"linear-gradient(90deg,#f59e0b,#d97706)",borderRadius:"99px",animation:"loading 1.2s ease-in-out infinite"}}/></div>
      <style>{`@keyframes loading{0%{transform:translateX(-100%)}100%{transform:translateX(400%)}}`}</style>
    </div>
  );

  if (error) return (
    <div style={{background:"#060d18",minHeight:"100vh",display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:"1rem",fontFamily:"'DM Sans',sans-serif",padding:"2rem"}}>
      <div style={{color:"#f87171",fontSize:"2rem"}}>⚠</div>
      <div style={{color:"#f1f5f9",fontWeight:600}}>Erro ao ligar ao Supabase</div>
      <div style={{color:"#475569",fontSize:"0.82rem"}}>{error}</div>
      <button onClick={loadAll} style={{background:"linear-gradient(135deg,#f59e0b,#d97706)",color:"#000",border:"none",borderRadius:"10px",padding:"0.6rem 1.4rem",cursor:"pointer",fontWeight:700}}>Tentar novamente</button>
    </div>
  );

  return (
    <div style={{fontFamily:"'DM Sans',sans-serif",background:"#060d18",minHeight:"100vh",display:"flex",color:"#e2e8f0",position:"relative"}}>
      <aside style={{width:sideOpen?"240px":"64px",minHeight:"100vh",background:"#080f1c",borderRight:"1px solid rgba(255,255,255,0.04)",display:"flex",flexDirection:"column",flexShrink:0,transition:"width 0.28s cubic-bezier(.4,0,.2,1)",overflow:"visible",position:"relative"}}>
        <div style={{position:"absolute",top:0,left:0,width:"2px",height:"100%",background:"linear-gradient(180deg,#f59e0b40 0%,transparent 60%)",zIndex:0}}/>

        {/* Seta flutuante */}
        <button onClick={()=>setSideOpen(s=>!s)} title={sideOpen?"Esconder":"Mostrar"}
          style={{position:"absolute",top:"50%",right:"-14px",transform:"translateY(-50%)",width:"28px",height:"28px",borderRadius:"50%",background:"#0f1e30",border:"1px solid rgba(255,255,255,0.1)",color:"#475569",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",zIndex:50,boxShadow:"0 2px 8px rgba(0,0,0,0.4)",transition:"all 0.2s"}}
          onMouseEnter={e=>{e.currentTarget.style.background="#1e3a5f";e.currentTarget.style.color="#f59e0b";e.currentTarget.style.borderColor="rgba(245,158,11,0.3)";}}
          onMouseLeave={e=>{e.currentTarget.style.background="#0f1e30";e.currentTarget.style.color="#475569";e.currentTarget.style.borderColor="rgba(255,255,255,0.1)";}}>
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
            style={{transform:sideOpen?"rotate(0deg)":"rotate(180deg)",transition:"transform 0.28s cubic-bezier(.4,0,.2,1)"}}>
            <path d="M15 18l-6-6 6-6"/>
          </svg>
        </button>

        {/* Logo */}
        <div style={{padding:"1.3rem 1rem 1.1rem",borderBottom:"1px solid rgba(255,255,255,0.04)",display:"flex",alignItems:"center",gap:"10px",minHeight:"64px"}}>
          <div style={{width:"34px",height:"34px",borderRadius:"10px",background:"linear-gradient(135deg,#f59e0b,#b45309)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0,boxShadow:"0 4px 12px rgba(245,158,11,0.3)"}}>
            <Icon name="fuel" size={16}/>
          </div>
          {sideOpen&&<div>
            <div style={{color:"#f1f5f9",fontFamily:"'Syne',sans-serif",fontWeight:800,fontSize:"0.88rem",letterSpacing:"-0.02em",lineHeight:1.1}}>FuelFlow</div>
            <div style={{color:"#334155",fontSize:"0.6rem",textTransform:"uppercase",letterSpacing:"0.12em",marginTop:"1px"}}>Gestão · Moçambique</div>
          </div>}
        </div>

        {/* Nav */}
        <nav style={{padding:"0.8rem 0.5rem",flex:1,display:"flex",flexDirection:"column",gap:"2px",overflowY:"auto"}}>
          {navItems.map(item=>{
            const active=view===item.id;
            const showBadge=item.id==="payments"&&totalDivida>0.01;
            return (
              <button key={item.id} onClick={()=>{setPayPreClient(null);setView(item.id);}} title={!sideOpen?item.label:undefined}
                className={`nav-btn${active?" active":""}`}
                style={{width:"100%",display:"flex",alignItems:"center",gap:"9px",padding:"0.62rem 0.75rem",borderRadius:"10px",border:"none",background:active?"rgba(245,158,11,0.12)":"transparent",color:active?"#f59e0b":"#475569",cursor:"pointer",textAlign:"left",whiteSpace:"nowrap",position:"relative"}}>
                <span style={{flexShrink:0,opacity:active?1:0.7}}><Icon name={item.icon} size={17}/></span>
                {sideOpen&&<span style={{fontSize:"0.82rem",fontWeight:active?600:400,letterSpacing:active?"-0.01em":0}}>{item.label}</span>}
                {active&&<div style={{position:"absolute",left:0,top:"20%",bottom:"20%",width:"2px",borderRadius:"2px",background:"#f59e0b"}}/>}
                {showBadge&&<div style={{marginLeft:"auto",background:"#ef4444",color:"#fff",borderRadius:"999px",fontSize:"0.58rem",fontWeight:700,padding:"1px 7px",minWidth:"18px",textAlign:"center"}}>
                  {sideOpen?`${fmt(totalDivida).split(",")[0]} MT`:"!"}
                </div>}
              </button>
            );
          })}
        </nav>

        {/* User + Logout */}
        <div style={{padding:"0.7rem 0.5rem",borderTop:"1px solid rgba(255,255,255,0.04)"}}>
          {sideOpen&&<div style={{padding:"0.5rem 0.75rem",marginBottom:"4px"}}>
            <div style={{color:"#475569",fontSize:"0.7rem",overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{profile?.nome||user?.email}</div>
            <div style={{color:"#2d4a6b",fontSize:"0.62rem",textTransform:"uppercase",letterSpacing:"0.08em"}}>Admin</div>
          </div>}
          <button onClick={handleLogout} title="Sair" style={{width:"100%",display:"flex",alignItems:"center",gap:"9px",padding:"0.55rem 0.75rem",borderRadius:"10px",border:"none",background:"transparent",color:"#334155",cursor:"pointer",whiteSpace:"nowrap"}}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/></svg>
            {sideOpen&&<span style={{fontSize:"0.78rem"}}>Sair</span>}
          </button>
        </div>
      </aside>

      <main style={{flex:1,padding:"2rem 2.2rem",overflowX:"auto",minWidth:0,background:"#060d18"}}>
        {view==="dashboard"  &&<Dashboard    orders={orders} clients={clients} products={products} payments={payments} onNavTo={navTo}/>}
        {view==="clients"    &&<Clients      clients={clients} orders={orders} payments={payments} onSave={saveClient} onDelete={delClient} onNavTo={navTo}/>}
        {view==="payments"   &&<Payments     payments={payments} clients={clients} orders={orders} invoices={invoices} onSave={savePayment} onDelete={delPayment} preSelectedClient={payPreClient}/>}
        {view==="products"   &&<Products     products={products} onSave={saveProduct} onDelete={delProduct} priceHistory={priceHistory} onPriceChange={addPriceH}/>}
        {view==="orders"     &&<Orders       orders={orders} clients={clients} products={products} payments={payments} onSave={saveOrder} onDelete={delOrder}/>}
        {view==="reports"    &&<Reports      orders={orders} clients={clients} products={products} payments={payments}/>}
        {view==="faturas"    &&<Faturas      clients={clients} orders={orders} products={products} payments={payments} invoices={invoices} onSave={saveInvoice} onDelete={delInvoice}/>}
        {view==="turnos"     &&<TurnosAdmin/>}
        {view==="mangueiras" &&<HosesAdmin/>}
        {view==="users"      &&<UsersAdmin   currentUser={user}/>}
      </main>
    </div>
  );
}
