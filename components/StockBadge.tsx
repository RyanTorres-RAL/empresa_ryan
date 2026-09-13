"use client";

/**
 * The stock count, rendered the same way everywhere it appears (Produtos and
 * Vendas both use this — one component so the two screens can never disagree
 * about what "-2" looks like).
 *
 * A NEGATIVE count is not an error state. It means more was sold than the
 * count said was there, which the app allows on purpose rather than blocking a
 * real sale at the counter. But it must be impossible to miss, so it takes the
 * danger token pair and spells out the action in words: recontar.
 *
 * Zero is the softer case — nothing left to sell, but nothing is wrong.
 */
export default function StockBadge({ stock }: { stock: number }) {
  const n = Math.trunc(stock);

  if (n < 0) {
    return (
      <span className="tag tag-danger num" title="Vendeu mais do que havia no estoque. Confira a quantidade real.">
        {n} · recontar
      </span>
    );
  }

  if (n === 0) {
    return <span className="tag tag-warn num">0 · acabou</span>;
  }

  return (
    <span className="tag tag-neutral num">
      {n} <span className="stock-unit">em estoque</span>
    </span>
  );
}
