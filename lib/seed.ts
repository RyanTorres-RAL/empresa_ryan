import { Product, Client, Sale } from "./types";

export const seedProducts: Product[] = [
  { id: "prod-1", name: "Açaí Copo 300ml", category: "Açaí", size: "300ml", price: 12, complements: [] },
  { id: "prod-2", name: "Sorvete Copo 300ml", category: "Sorvete", size: "300ml", price: 12, complements: [] },
];

export const seedClients: Client[] = [
  {
    id: "client-1787871879262", name: "Adina", matricula: "1181305",
    totalPurchases: 2, totalSpent: 24, totalDebt: 0, status: "Adimplente",
    fidelityStamps: 2, fidelityRewardsClaimed: 0, createdAt: 1787871879262,
    lastPurchaseDate: "27/08/2026",
  },
  {
    id: "client-1787871683861", name: "Ryan Mateus", matricula: "",
    totalPurchases: 1, totalSpent: 12, totalDebt: 0, status: "Adimplente",
    fidelityStamps: 1, fidelityRewardsClaimed: 0, createdAt: 1787871683861,
    lastPurchaseDate: "27/08/2026",
  },
  {
    id: "client-1787867864418", name: "Ryan Mateus Valesi Torres", matricula: "",
    totalPurchases: 1, totalSpent: 12, totalDebt: 0, status: "Adimplente",
    fidelityStamps: 1, fidelityRewardsClaimed: 0, createdAt: 1787867864418,
    lastPurchaseDate: "27/08/2026",
  },
];

export const seedSales: Sale[] = [
  {
    id: "sale-1787872697326", date: "27/08/2026", month: "agosto de 2026",
    clientName: "Adina", clientId: "client-1787871879262",
    items: [{ id: "item-1787872662205", name: "Açaí Artesanal Copo Pronto (300ml)", unitPrice: 12, quantity: 1, total: 12 }],
    quantity: 1, total: 12,
    paymentBreakdown: { dinheiro: 12, pix: 0, debito: 0, credito: 0, va: 0, fiado: 0 },
    mainPaymentMethod: "Dinheiro", status: "Pago",
    notes: "Encomenda entregue (#ENC-004)", createdAt: 1787872697326,
  },
  {
    id: "sale-1787872172533", date: "27/08/2026", month: "agosto de 2026",
    clientName: "Adina", clientId: "client-1787871879262",
    items: [{ id: "item-1787871981755", name: "Açaí Artesanal Copo Pronto (300ml)", unitPrice: 12, quantity: 1, total: 12 }],
    quantity: 1, total: 12,
    paymentBreakdown: { dinheiro: 0, pix: 12, debito: 0, credito: 0, va: 0, fiado: 0 },
    mainPaymentMethod: "Pix", status: "Pago",
    notes: "Encomenda entregue (#ENC-003)", createdAt: 1787872172533,
  },
  {
    id: "sale-1787871683855", date: "27/08/2026", month: "agosto de 2026",
    clientName: "Ryan Mateus", clientId: "client-1787871683861",
    items: [{ id: "item-ord-1", name: "Açaí Artesanal Copo Pronto 300ml", unitPrice: 12, quantity: 1, total: 12 }],
    quantity: 1, total: 12,
    paymentBreakdown: { dinheiro: 0, pix: 12, debito: 0, credito: 0, va: 0, fiado: 0 },
    mainPaymentMethod: "Pix", status: "Pago",
    notes: "Encomenda entregue (#ENC-001) • Caprichar no Leite Ninho!", createdAt: 1787871683855,
  },
  {
    id: "sale-1787867864407", date: "27/08/2026", month: "agosto de 2026",
    clientName: "Ryan Mateus Valesi Torres", clientId: "client-1787867864418",
    items: [{ id: "item-1787867864407", name: "Açaí Tradicional 300ml", unitPrice: 12, quantity: 1, total: 12 }],
    quantity: 1, total: 12,
    paymentBreakdown: { dinheiro: 0, pix: 12, debito: 0, credito: 0, va: 0, fiado: 0 },
    mainPaymentMethod: "Pix", status: "Pago",
    notes: "", createdAt: 1787867864407,
  },
];
