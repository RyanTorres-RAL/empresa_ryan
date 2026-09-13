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
import { normalizeWhatsapp } from "@/lib/phone";
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
 * requireOwner() covers what only the dono may do: products (including manual
 * stock corrections), cash-outs, and editing or deleting sales (an employee
 * must not be able to rewrite or erase sales history). Day-to-day work —
 * finalizing a sale, adding a client, taking a fiado payment — is
 * requireUser().
 *
 * Watch the seam between those two where stock is concerned: the automatic
 * decrement when a sale is finalized belongs to the SALE, so it happens inside
 * finalizeSale under requireUser() and works for employees. Only the manual
 * "+10 / -2" correction (adjustProductStock) is owner-only.
 * ─────────────────────────────────────────────────────────────────────────
 */

export type ActionResult = { ok: true; data: AppData } | { ok: false; error: string };

async function refreshed(): Promise<ActionResult> {
  const data = await loadAppDataInternal();
  return { ok: true, data };
}

/**
 * Applies signed stock deltas keyed by product id, as a read-modify-write.
 * Negative deltas sell units, positive ones give them back.
 *
 * NOT clamped at zero, on purpose: overselling is allowed (see Product.stock),
 * so a sale that takes a product to -2 stores -2 and the Produtos/Vendas cards
 * flag it for recounting.
 *
 * Write errors are deliberately swallowed. Both callers run this *after* the
 * sale they belong to is already committed, and there is no transaction
 * spanning the two (PostgREST, as everywhere else in this file). Reporting a
 * stock error as a failed sale would invite the owner to ring the same sale up
 * a second time — a duplicate sale is far worse than a count that drifted by a
 * few units, which the owner fixes from the Produtos screen in two taps.
 */
async function applyStockDeltas(
  supabase: ReturnType<typeof getSupabaseServerClient>,
  deltas: Map<string, number>
): Promise<void> {
  const ids = [...deltas.keys()].filter((id) => !!id);
  if (ids.length === 0) return;

  const { data: rows, error } = await supabase
    .from("crm_products")
    .select("id, stock")
    .in("id", ids);
  if (error || !rows) return;

  await Promise.all(
    rows.map((row) => {
      const delta = deltas.get(row.id) ?? 0;
      if (delta === 0) return Promise.resolve();
      const next = Math.trunc(Number(row.stock) || 0) + delta;
      return supabase.from("crm_products").update({ stock: next }).eq("id", row.id);
    })
  );
}

export async function loadAppData(): Promise<AppData> {
  await requireUser();
  return loadAppDataInternal();
}

// ---------- Sales ----------

export interface FinalizeSaleActionInput {
  /**
   * `productId` is carried through only to move stock — crm_sale_items stores
   * the item's name and price, never a product reference, so the sale record
   * itself is unchanged and still survives a product being renamed or deleted.
   */
  cart: { productId: string; name: string; price: number; quantity: number }[];
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
        // Nobody typed a number at the till; the client detail dialog is where
        // one gets added later.
        whatsapp: "",
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

  // Stock follows the sale: each product loses the quantity sold.
  //
  // This sits inside finalizeSale, under requireUser() — NOT requireOwner().
  // Employees ring up sales, so the count has to move for them too. The
  // owner-only path is adjustProductStock, the manual correction below.
  //
  // Nothing is clamped: if the count goes negative the sale still records, and
  // the screens flag the product for recounting. The Vendas screen warns the
  // person before they finalize, but never blocks them.
  const soldByProduct = new Map<string, number>();
  for (const line of cart) {
    if (!line.productId) continue;
    const sold = Math.trunc(line.quantity) || 0;
    soldByProduct.set(line.productId, (soldByProduct.get(line.productId) ?? 0) - sold);
  }
  await applyStockDeltas(supabase, soldByProduct);

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

/**
 * Edits a finalized sale's money and paperwork only: total, payment method and
 * notes (plus the fiado bookkeeping those imply).
 *
 * NO STOCK EFFECT, and that is not an oversight. This function never reads or
 * writes crm_sale_items — the line items, and therefore the quantities that
 * came off the shelf, are exactly what they were. Correcting a total after the
 * fact does not put a cup back in the freezer. The only two things that move
 * stock are finalizeSale (down) and deleteSale (back up).
 */
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

/**
 * Deletes a sale and undoes everything it did — including putting its units
 * back on the shelf (the mirror of the decrement in finalizeSale).
 */
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

  // Read the line items BEFORE the delete: crm_sale_items cascades away with
  // the sale, and these quantities are what has to go back into stock.
  const { data: itemRows } = await supabase
    .from("crm_sale_items")
    .select("name, quantity")
    .eq("sale_id", saleId);

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

  // Give the units back.
  //
  // crm_sale_items records the item's NAME and no product id, so the product
  // has to be matched by name (trimmed, case-insensitively). A line whose
  // product was since renamed or deleted matches nothing and is skipped —
  // silently doing nothing beats crediting somebody else's product.
  if (itemRows && itemRows.length > 0) {
    const { data: productRows } = await supabase.from("crm_products").select("id, name");
    const idByName = new Map<string, string>();
    for (const p of productRows ?? []) {
      idByName.set(String(p.name).trim().toLowerCase(), p.id);
    }

    const restored = new Map<string, number>();
    for (const item of itemRows) {
      const productId = idByName.get(String(item.name).trim().toLowerCase());
      if (!productId) continue;
      const qty = Math.trunc(Number(item.quantity) || 0);
      restored.set(productId, (restored.get(productId) ?? 0) + qty);
    }
    await applyStockDeltas(supabase, restored);
  }

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
  /** Opening count, used when CREATING a product. Ignored on edit — see below. */
  stock?: number;
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
    // Note what is NOT here: `stock`.
    //
    // Editing a product changes its name, size, price and complements. If the
    // update also wrote back the stock number the dialog was opened with, then
    // fixing a typo in a price would silently undo every sale rung up while
    // the dialog sat open. Stock moves through exactly two doors — a sale, and
    // adjustProductStock — so it cannot be clobbered by an unrelated edit.
    const { error } = await supabase.from("crm_products").update(payload).eq("id", input.id);
    if (error) return { ok: false, error: error.message };
  } else {
    const { error } = await supabase
      .from("crm_products")
      .insert({ ...payload, stock: Math.trunc(input.stock ?? 0) || 0 });
    if (error) return { ok: false, error: error.message };
  }

  return refreshed();
}

/**
 * The manual stock correction: "+10 fiz mais", "-2 quebrei".
 *
 * OWNER ONLY, consistent with the rest of the Produtos screen — an employee
 * must not be able to rewrite the counts. The automatic movement that happens
 * when a sale is finalized is a different thing entirely and lives inside
 * finalizeSale under requireUser(), so employees can still sell.
 *
 * `delta` is signed and the result is not clamped: taking the count negative
 * on purpose is allowed, same as overselling.
 */
export async function adjustProductStock(id: string, delta: number): Promise<ActionResult> {
  await requireOwner();

  const step = Math.trunc(delta);
  if (!Number.isFinite(step) || step === 0) {
    return { ok: false, error: "Digite uma quantidade diferente de zero." };
  }

  const supabase = getSupabaseServerClient();

  const { data: row, error: readErr } = await supabase
    .from("crm_products")
    .select("id, stock")
    .eq("id", id)
    .maybeSingle();
  if (readErr) return { ok: false, error: readErr.message };
  if (!row) return { ok: false, error: "Produto não encontrado." };

  const next = Math.trunc(Number(row.stock) || 0) + step;
  const { error } = await supabase.from("crm_products").update({ stock: next }).eq("id", id);
  if (error) return { ok: false, error: error.message };

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

/**
 * `whatsapp` is optional and is normalised to digits-with-country-code here,
 * on the server, so nothing can reach the column by another route — the
 * browser is not the only caller a Server Action can have. An unusable value
 * that is not simply blank is refused rather than stored as junk, because the
 * whole point of the field is that the loyalty card can dial it.
 */
export async function addClient(name: string, whatsapp: string): Promise<ActionResult> {
  await requireUser();

  if (!name.trim()) return { ok: false, error: "Digite o nome do cliente." };

  const phone = normalizeWhatsapp(whatsapp);
  if (!phone.ok) return { ok: false, error: phone.error };

  const supabase = getSupabaseServerClient();
  const { error } = await supabase.from("crm_clients").insert({
    name: name.trim(),
    whatsapp: phone.digits,
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
