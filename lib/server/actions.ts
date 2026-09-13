"use server";

import { getSupabaseServerClient } from "@/lib/supabase/server";
import {
  AppData,
  PAYMENT_DISPLAY,
  PaymentMethod,
  Product,
  emptyBreakdown,
  labelToPaymentMethod,
} from "@/lib/types";
import { loadAppDataInternal } from "./queries";
import { brDateToDb, monthLabelFromMs, msToDbDate, msToDbTimestamp } from "./dates";
import { requireOwner, requireUser } from "./auth";

/**
 * Server Actions for every mutation the app performs. These replace the old
 * localStorage `persist()` call in components/App.tsx: each function here
 * does its Postgres read-modify-write (kept inside one function so it stays
 * consistent, mirroring exactly what the old client-side reducer computed),
 * then returns a fresh full AppData snapshot for the client to render.
 *
 * All of this runs with the service_role key (see lib/supabase/server.ts),
 * which is the only way to reach the crm_* tables since they have RLS
 * enabled with zero policies.
 *
 * ─────────────────────────────────────────────────────────────────────────
 * AUTHORIZATION — READ BEFORE ADDING AN ACTION HERE
 *
 * Every exported function in this file MUST have a guard as its FIRST
 * statement, no exceptions:
 *
 *     await requireUser();    // any signed-in, active person
 *     await requireOwner();   // dono only
 *
 * These are exported Server Actions: anyone who is signed in can invoke them
 * directly over HTTP, whether or not the UI shows the button. Hiding a tab in
 * the nav is cosmetic; this line is the actual protection.
 *
 * requireOwner() covers what only the dono may do: products, cash-outs, and
 * editing or deleting sales (an employee must not be able to rewrite or erase
 * sales history). Day-to-day work — finalizing a sale, adding a client,
 * taking a fiado payment — is requireUser().
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ActionResult = { ok: true; data: AppData } | { ok: false; error: string };

async function refreshed(): Promise<ActionResult> {
  const data = await loadAppDataInternal();
  return { ok: true, data };
}

export async function loadAppData(): Promise<AppData> {
  await requireUser();
  return loadAppDataInternal();
}

// ---------- Sales ----------

export interface FinalizeSaleActionInput {
  cart: { name: string; price: number; quantity: number }[];
  clientName: string;
  method: PaymentMethod;
  fiadoDueDate?: number;
  notes: string;
  now: number; // client-captured Date.now(), so dates reflect the browser's clock/timezone
}

export async function finalizeSale(input: FinalizeSaleActionInput): Promise<ActionResult> {
  await requireUser();

  const { cart, clientName, method, fiadoDueDate, notes, now } = input;

  if (cart.length === 0) return { ok: false, error: "Adicione itens ao carrinho." };
  if (!clientName.trim()) return { ok: false, error: "Digite o nome do cliente." };
  if (!method) return { ok: false, error: "Escolha a forma de pagamento." };

  const supabase = getSupabaseServerClient();

  // Case-insensitive exact-name match, mirroring findClientByNameCI.
  const { data: clientRows, error: clientsErr } = await supabase.from("crm_clients").select("*");
  if (clientsErr) return { ok: false, error: clientsErr.message };
  const target = clientName.trim().toLowerCase();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let clientRow = (clientRows ?? []).find((c: any) => String(c.name).trim().toLowerCase() === target);

  if (!clientRow) {
    const { data: inserted, error: insertClientErr } = await supabase
      .from("crm_clients")
      .insert({
        name: clientName.trim(),
        matricula: "",
        total_purchases: 0,
        total_spent: 0,
        total_debt: 0,
        status: "Adimplente",
        fidelity_stamps: 0,
        fidelity_rewards_claimed: 0,
        last_purchase_date: null,
      })
      .select()
      .single();
    if (insertClientErr || !inserted) {
      return { ok: false, error: insertClientErr?.message ?? "Falha ao criar cliente." };
    }
    clientRow = inserted;
  }

  const saleItems = cart.map((c) => ({
    name: c.name,
    unitPrice: c.price,
    quantity: c.quantity,
    total: c.price * c.quantity,
  }));
  const total = saleItems.reduce((s, i) => s + i.total, 0);
  const breakdown = emptyBreakdown();
  breakdown[method] = total;

  const { data: saleRow, error: saleErr } = await supabase
    .from("crm_sales")
    .insert({
      client_id: clientRow.id,
      client_name: clientRow.name,
      sale_date: msToDbDate(now),
      month_label: monthLabelFromMs(now),
      quantity: saleItems.length,
      total,
      payment_breakdown: breakdown,
      main_payment_method: PAYMENT_DISPLAY[method],
      status: method === "fiado" ? "Pendente" : "Pago",
      notes: notes.trim(),
      created_at: msToDbTimestamp(now),
    })
    .select()
    .single();
  if (saleErr || !saleRow) return { ok: false, error: saleErr?.message ?? "Falha ao registrar venda." };

  const { error: itemsErr } = await supabase.from("crm_sale_items").insert(
    saleItems.map((i) => ({
      sale_id: saleRow.id,
      name: i.name,
      unit_price: i.unitPrice,
      quantity: i.quantity,
      total: i.total,
    }))
  );
  if (itemsErr) return { ok: false, error: itemsErr.message };

  const newTotalPurchases = (clientRow.total_purchases ?? 0) + 1;
  const newTotalSpent = Number(clientRow.total_spent ?? 0) + total;
  const newFidelityStamps = (clientRow.fidelity_stamps ?? 0) + 1;
  const newTotalDebt = method === "fiado" ? Number(clientRow.total_debt ?? 0) + total : Number(clientRow.total_debt ?? 0);
  const newStatus = method === "fiado" ? "Devedor" : clientRow.status;

  const { error: updateClientErr } = await supabase
    .from("crm_clients")
    .update({
      total_purchases: newTotalPurchases,
      total_spent: newTotalSpent,
      fidelity_stamps: newFidelityStamps,
      last_purchase_date: msToDbDate(now),
      total_debt: newTotalDebt,
      status: newStatus,
    })
    .eq("id", clientRow.id);
  if (updateClientErr) return { ok: false, error: updateClientErr.message };

  if (method === "fiado") {
    const due = fiadoDueDate ?? now + 7 * 24 * 60 * 60 * 1000;
    const { error: fiadoErr } = await supabase.from("crm_fiados").insert({
      client_id: clientRow.id,
      client_name: clientRow.name,
      sale_id: saleRow.id,
      amount: total,
      amount_paid: 0,
      due_date: msToDbDate(due),
      paid: false,
      created_at: msToDbTimestamp(now),
    });
    if (fiadoErr) return { ok: false, error: fiadoErr.message };
  }

  return refreshed();
}

export interface EditSaleActionInput {
  saleId: string;
  total: number;
  method: PaymentMethod;
  notes: string;
  now: number;
}

export async function editSale(input: EditSaleActionInput): Promise<ActionResult> {
  await requireOwner();

  const supabase = getSupabaseServerClient();

  const { data: saleRow, error: saleErr } = await supabase
    .from("crm_sales")
    .select("*")
    .eq("id", input.saleId)
    .maybeSingle();
  if (saleErr) return { ok: false, error: saleErr.message };
  if (!saleRow) return refreshed();

  const oldTotal = Number(saleRow.total);
  const oldMethod = labelToPaymentMethod(saleRow.main_payment_method);
  const newTotal = input.total;
  const newMethod = input.method;

  const breakdown = emptyBreakdown();
  breakdown[newMethod] = newTotal;

  const { error: updateSaleErr } = await supabase
    .from("crm_sales")
    .update({
      total: newTotal,
      payment_breakdown: breakdown,
      main_payment_method: PAYMENT_DISPLAY[newMethod],
      notes: input.notes,
      status: newMethod === "fiado" ? "Pendente" : "Pago",
    })
    .eq("id", input.saleId);
  if (updateSaleErr) return { ok: false, error: updateSaleErr.message };

  if (saleRow.client_id) {
    const { data: clientRow } = await supabase
      .from("crm_clients")
      .select("*")
      .eq("id", saleRow.client_id)
      .maybeSingle();

    if (clientRow) {
      let totalSpent = Number(clientRow.total_spent) + (newTotal - oldTotal);
      let totalDebt = Number(clientRow.total_debt);
      let status: "Adimplente" | "Devedor" = clientRow.status;

      const wasFiado = oldMethod === "fiado";
      const isFiado = newMethod === "fiado";

      // First not-yet-paid fiado for this sale, mirroring findFiadoBySaleId.
      const { data: existingFiado } = await supabase
        .from("crm_fiados")
        .select("*")
        .eq("sale_id", input.saleId)
        .eq("paid", false)
        .limit(1)
        .maybeSingle();

      if (wasFiado && !isFiado) {
        if (existingFiado) {
          const remaining = Number(existingFiado.amount) - Number(existingFiado.amount_paid);
          totalDebt = Math.max(0, totalDebt - remaining);
          await supabase.from("crm_fiados").delete().eq("id", existingFiado.id);
        }
        if (totalDebt <= 0) {
          totalDebt = 0;
          status = "Adimplente";
        }
      } else if (!wasFiado && isFiado) {
        await supabase.from("crm_fiados").insert({
          client_id: clientRow.id,
          client_name: clientRow.name,
          sale_id: input.saleId,
          amount: newTotal,
          amount_paid: 0,
          due_date: msToDbDate(input.now + 7 * 24 * 60 * 60 * 1000),
          paid: false,
          created_at: msToDbTimestamp(input.now),
        });
        totalDebt = totalDebt + newTotal;
        status = "Devedor";
      } else if (wasFiado && isFiado) {
        const delta = newTotal - oldTotal;
        if (existingFiado) {
          await supabase
            .from("crm_fiados")
            .update({ amount: Number(existingFiado.amount) + delta })
            .eq("id", existingFiado.id);
        }
        totalDebt = Math.max(0, totalDebt + delta);
        status = totalDebt <= 0 ? "Adimplente" : "Devedor";
      }

      const { error: updateClientErr } = await supabase
        .from("crm_clients")
        .update({ total_spent: totalSpent, total_debt: totalDebt, status })
        .eq("id", clientRow.id);
      if (updateClientErr) return { ok: false, error: updateClientErr.message };
    }
  }

  return refreshed();
}

export async function deleteSale(saleId: string): Promise<ActionResult> {
  await requireOwner();

  const supabase = getSupabaseServerClient();

  const { data: saleRow, error: saleErr } = await supabase
    .from("crm_sales")
    .select("*")
    .eq("id", saleId)
    .maybeSingle();
  if (saleErr) return { ok: false, error: saleErr.message };
  if (!saleRow) return refreshed();

  if (saleRow.client_id) {
    const { data: clientRow } = await supabase
      .from("crm_clients")
      .select("*")
      .eq("id", saleRow.client_id)
      .maybeSingle();

    if (clientRow) {
      const totalPurchases = Math.max(0, (clientRow.total_purchases ?? 0) - 1);
      const totalSpent = Math.max(0, Number(clientRow.total_spent) - Number(saleRow.total));
      const fidelityStamps = Math.max(0, (clientRow.fidelity_stamps ?? 0) - 1);
      let totalDebt = Number(clientRow.total_debt);
      let status: "Adimplente" | "Devedor" = clientRow.status;

      const { data: existingFiado } = await supabase
        .from("crm_fiados")
        .select("*")
        .eq("sale_id", saleId)
        .eq("paid", false)
        .limit(1)
        .maybeSingle();

      if (existingFiado) {
        const remaining = Number(existingFiado.amount) - Number(existingFiado.amount_paid);
        totalDebt = Math.max(0, totalDebt - remaining);
        await supabase.from("crm_fiados").delete().eq("id", existingFiado.id);
        status = totalDebt <= 0 ? "Adimplente" : "Devedor";
      }

      const { error: updateClientErr } = await supabase
        .from("crm_clients")
        .update({
          total_purchases: totalPurchases,
          total_spent: totalSpent,
          fidelity_stamps: fidelityStamps,
          total_debt: totalDebt,
          status,
        })
        .eq("id", clientRow.id);
      if (updateClientErr) return { ok: false, error: updateClientErr.message };
    }
  }

  // crm_sale_items has ON DELETE CASCADE on sale_id, so this also removes them.
  const { error: deleteErr } = await supabase.from("crm_sales").delete().eq("id", saleId);
  if (deleteErr) return { ok: false, error: deleteErr.message };

  return refreshed();
}

// ---------- Products ----------

export interface SaveProductActionInput {
  id?: string;
  name: string;
  category: Product["category"];
  size: string;
  price: number;
  complements: string[];
}

export async function saveProduct(input: SaveProductActionInput): Promise<ActionResult> {
  await requireOwner();

  if (!input.name.trim()) return { ok: false, error: "Digite o nome do produto." };

  const supabase = getSupabaseServerClient();
  const payload = {
    name: input.name,
    category: input.category,
    size: input.size,
    price: input.price,
    complements: input.complements,
  };

  if (input.id) {
    const { error } = await supabase.from("crm_products").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("crm_products").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  return refreshed();
}

export async function deleteProduct(id: string): Promise<ActionResult> {
  await requireOwner();

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_products").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return refreshed();
}

// ---------- Clients ----------

export async function addClient(name: string, matricula: string): Promise<ActionResult> {
  await requireUser();

  if (!name.trim()) return { ok: false, error: "Digite o nome do cliente." };

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_clients").insert({
    name: name.trim(),
    matricula: matricula.trim(),
    total_purchases: 0,
    total_spent: 0,
    total_debt: 0,
    status: "Adimplente",
    fidelity_stamps: 0,
    fidelity_rewards_claimed: 0,
    last_purchase_date: null,
  });
  if (error) return { ok: false, error: error.message };

  return refreshed();
}

/**
 * Removes a client. Sales keep their own `client_name`, and the foreign key is
 * ON DELETE SET NULL, so deleting somebody never erases takings from the sales
 * history or the caixa — the rows just stop pointing at a client.
 *
 * A client who still owes money is refused. Losing the record of a debt is not
 * something the owner could undo from the UI, and there is already a correct
 * way to clear it: register the payment in Fiado, or delete the fiado sale.
 */
export async function deleteClient(id: string): Promise<ActionResult> {
  await requireOwner();

  const supabase = getSupabaseServerClient();

  const { data: client, error: readError } = await supabase
    .from("crm_clients")
    .select("id, total_debt")
    .eq("id", id)
    .maybeSingle();
  if (readError) return { ok: false, error: readError.message };
  if (!client) return { ok: false, error: "Cliente não encontrado." };

  const { data: openFiados, error: fiadoError } = await supabase
    .from("crm_fiados")
    .select("id")
    .eq("client_id", id)
    .eq("paid", false);
  if (fiadoError) return { ok: false, error: fiadoError.message };

  if ((openFiados?.length ?? 0) > 0 || Number(client.total_debt) > 0) {
    return {
      ok: false,
      error:
        "Este cliente tem fiado em aberto. Registre o pagamento na aba Fiado antes de excluir.",
    };
  }

  const { error } = await supabase.from("crm_clients").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return refreshed();
}

// ---------- Fiado ----------

export interface RegisterFiadoPaymentActionInput {
  fiadoId: string;
  amount: number;
  method: PaymentMethod;
  now: number;
}

export async function registerFiadoPayment(input: RegisterFiadoPaymentActionInput): Promise<ActionResult> {
  await requireUser();

  if (!(input.amount > 0)) return { ok: false, error: "Digite um valor válido." };

  const supabase = getSupabaseServerClient();

  const { data: fiadoRow, error: fiadoErr } = await supabase
    .from("crm_fiados")
    .select("*")
    .eq("id", input.fiadoId)
    .maybeSingle();
  if (fiadoErr) return { ok: false, error: fiadoErr.message };
  if (!fiadoRow) return refreshed();

  const amountPaid = Number(fiadoRow.amount_paid) + input.amount;
  const remaining = Number(fiadoRow.amount) - amountPaid;
  const paid = remaining <= 0.009;

  const { error: updateFiadoErr } = await supabase
    .from("crm_fiados")
    .update({
      amount_paid: amountPaid,
      paid,
      paid_at: paid ? msToDbTimestamp(input.now) : fiadoRow.paid_at,
    })
    .eq("id", input.fiadoId);
  if (updateFiadoErr) return { ok: false, error: updateFiadoErr.message };

  if (fiadoRow.client_id) {
    const { data: clientRow } = await supabase
      .from("crm_clients")
      .select("*")
      .eq("id", fiadoRow.client_id)
      .maybeSingle();
    if (clientRow) {
      const totalDebt = Math.max(0, Number(clientRow.total_debt) - input.amount);
      const status = totalDebt <= 0 ? "Adimplente" : "Devedor";
      const { error: updateClientErr } = await supabase
        .from("crm_clients")
        .update({ total_debt: totalDebt, status })
        .eq("id", clientRow.id);
      if (updateClientErr) return { ok: false, error: updateClientErr.message };
    }
  }

  const { error: paymentErr } = await supabase.from("crm_fiado_payments").insert({
    fiado_id: input.fiadoId,
    client_id: fiadoRow.client_id,
    client_name: fiadoRow.client_name,
    amount: input.amount,
    method: input.method,
    payment_date: msToDbDate(input.now),
    created_at: msToDbTimestamp(input.now),
  });
  if (paymentErr) return { ok: false, error: paymentErr.message };

  return refreshed();
}

// ---------- Caixa ----------

export interface SaveCashOutActionInput {
  id?: string;
  amount: number;
  description: string;
  date: string; // dd/mm/yyyy, as picked in the UI
  createdAt: number;
}

export async function saveCashOut(input: SaveCashOutActionInput): Promise<ActionResult> {
  await requireOwner();

  if (!input.description.trim()) return { ok: false, error: "Digite uma descrição." };
  if (!(input.amount > 0)) return { ok: false, error: "Digite um valor válido." };

  const supabase = getSupabaseServerClient();
  const payload = {
    amount: input.amount,
    description: input.description,
    out_date: brDateToDb(input.date),
    created_at: msToDbTimestamp(input.createdAt),
  };

  if (input.id) {
    const { error } = await supabase.from("crm_cash_outs").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase.from("crm_cash_outs").insert(payload);
    if (error) return { ok: false, error: error.message };
  }

  return refreshed();
}

export async function deleteCashOut(id: string): Promise<ActionResult> {
  await requireOwner();

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_cash_outs").delete().eq("id", id);
  if (error) return { ok: false, error: error.message };
  return refreshed();
}
