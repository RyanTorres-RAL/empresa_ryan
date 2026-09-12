"use client";

import { ReactNode } from "react";

interface DialogProps {
  onClose: () => void;
  title?: string;
  children: ReactNode;
  size?: "sm" | "md" | "lg";
}

export function Dialog({ onClose, title, children, size = "md" }: DialogProps) {
  const sizeClass = size === "sm" ? "dialog-sm" : size === "lg" ? "dialog-lg" : "";
  return (
    <div
      className="dialog-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className={`dialog ${sizeClass}`}>
        {title && <div className="dialog-title">{title}</div>}
        {children}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  message,
  onCancel,
  onConfirm,
}: {
  message: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Dialog onClose={onCancel} title="Confirmar" size="sm">
      <p style={{ marginBottom: 0 }}>{message}</p>
      <div className="dialog-actions">
        <button className="btn btn-secondary" onClick={onCancel}>
          Cancelar
        </button>
        <button className="btn btn-primary" onClick={onConfirm}>
          Confirmar
        </button>
      </div>
    </Dialog>
  );
}

export function AlertDialog({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <Dialog onClose={onClose} title="Aviso" size="sm">
      <p style={{ marginBottom: 0 }}>{message}</p>
      <div className="dialog-actions">
        <button className="btn btn-primary" onClick={onClose}>
          OK
        </button>
      </div>
    </Dialog>
  );
}
