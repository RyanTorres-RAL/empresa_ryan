"use client";

import { CustomPeriodInput, PeriodPresetId, describeCustomIssue } from "@/lib/calc";

const PRESETS: { id: PeriodPresetId; label: string }[] = [
  { id: "hoje", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "90d", label: "90 dias" },
  { id: "custom", label: "Personalizado" },
];

/**
 * One filter row, above everything it scopes. Every tile, chart and table on
 * the Dashboard re-renders against this same slice, so the numbers always
 * agree — no chart carries a range of its own.
 */
export default function PeriodFilter({
  preset,
  onPresetChange,
  custom,
  onCustomChange,
  rangeLabel,
}: {
  preset: PeriodPresetId;
  onPresetChange: (p: PeriodPresetId) => void;
  custom: CustomPeriodInput;
  onCustomChange: (c: CustomPeriodInput) => void;
  rangeLabel: string;
}) {
  const issue = preset === "custom" ? describeCustomIssue(custom) : null;

  return (
    <div className="filter-bar">
      <div className="filter-chips" role="group" aria-label="Período">
        {PRESETS.map((p) => {
          const selected = preset === p.id;
          return (
            <button
              key={p.id}
              type="button"
              className={selected ? "filter-chip filter-chip-active" : "filter-chip"}
              aria-pressed={selected}
              onClick={() => onPresetChange(p.id)}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      {preset === "custom" ? (
        <div className="filter-dates">
          <label className="filter-date">
            <span>De</span>
            <input
              type="date"
              className="input"
              value={custom.from}
              onChange={(e) => onCustomChange({ ...custom, from: e.target.value })}
            />
          </label>
          <label className="filter-date">
            <span>Até</span>
            <input
              type="date"
              className="input"
              value={custom.to}
              onChange={(e) => onCustomChange({ ...custom, to: e.target.value })}
            />
          </label>
        </div>
      ) : null}

      <p className="filter-summary">{issue ?? `Mostrando ${rangeLabel}.`}</p>
    </div>
  );
}
