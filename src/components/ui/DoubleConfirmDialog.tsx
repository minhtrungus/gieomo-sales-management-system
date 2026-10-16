"use client";

import { useState, type ReactNode } from "react";
import { Modal } from "./Modal";
import { Input } from "./Input";

interface DoubleConfirmDialogProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmCode: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  details?: Array<{ label: string; value: string }>;
  children?: ReactNode;
  continueDisabled?: boolean;
}

export function DoubleConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  message,
  confirmCode,
  confirmLabel = "Xác nhận",
  cancelLabel = "Hủy",
  loading = false,
  details,
  children,
  continueDisabled = false,
}: DoubleConfirmDialogProps) {
  const [step, setStep] = useState(1);
  const [inputValue, setInputValue] = useState("");
  const [inputError, setInputError] = useState("");

  // Reset state when dialog opens/closes
  const handleOpenChange = () => {
    setStep(1);
    setInputValue("");
    setInputError("");
    onClose();
  };

  const handleStep1Confirm = () => {
    setStep(2);
  };

  const handleStep2Confirm = () => {
    if (inputValue.trim().toUpperCase() !== confirmCode) {
      setInputError(`Mã xác nhận không đúng. Vui lòng nhập "${confirmCode}"`);
      return;
    }
    onConfirm();
  };

  const handleCancel = () => {
    setStep(1);
    setInputValue("");
    setInputError("");
    onClose();
  };

  return (
    <Modal open={open} onClose={handleOpenChange} size="sm">
      {step === 1 && (
        <div className="text-center py-2">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-danger/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-danger"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">{title}</h3>
          <p className="text-sm text-muted mb-4">{message}</p>

          {details && details.length > 0 && (
            <div className="mb-4 p-3 bg-surface-hover rounded-[var(--radius-md)] text-left">
              {details.map((detail, idx) => (
                <div key={idx} className="flex justify-between text-sm">
                  <span className="text-muted">{detail.label}:</span>
                  <span className="font-medium text-foreground">{detail.value}</span>
                </div>
              ))}
            </div>
          )}

          {children && <div className="mb-4 text-left">{children}</div>}

          <p className="text-xs text-muted mb-6">
            Đây là thao tác quan trọng và có thể ảnh hưởng đến dữ liệu.
          </p>

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleCancel}
              className="h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover transition-colors"
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleStep1Confirm}
              disabled={continueDisabled}
              className={cn(
                "h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] bg-danger text-white hover:bg-red-600 transition-colors",
                continueDisabled ? "opacity-50 cursor-not-allowed hover:bg-red-600" : undefined
              )}
            >
             Tôi hiểu, tiếp tục
            </button>
          </div>
        </div>
      )}

      {step === 2 && (
        <div className="text-center py-2">
          <div className="w-12 h-12 mx-auto mb-4 rounded-full bg-warning/10 flex items-center justify-center">
            <svg
              className="w-6 h-6 text-warning"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 11c0-1 .9-2 2-2s2 1 2 2-.9 2-2 2-2-1-2-2zM12 3l8 14H4l8-14z"
              />
            </svg>
          </div>
          <h3 className="text-lg font-semibold text-foreground mb-2">Xác nhận cuối cùng</h3>
          <p className="text-sm text-muted mb-2">
            Nhập mã dưới đây để xác nhận thao tác này:
          </p>
          <div className="mb-4 p-3 bg-surface-hover rounded-[var(--radius-md)]">
            <span className="text-lg font-bold tracking-wider text-danger">{confirmCode}</span>
          </div>

          <Input
            type="text"
            placeholder={`Nhập "${confirmCode}"`}
            value={inputValue}
            onChange={(e) => {
              setInputValue(e.target.value.toUpperCase());
              setInputError("");
            }}
            className="mb-2"
            autoFocus
          />

          {inputError && (
            <p className="text-xs text-danger mb-4">{inputError}</p>
          )}

          <div className="flex gap-3 justify-center">
            <button
              onClick={handleCancel}
              className="h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] border border-border text-foreground hover:bg-surface-hover transition-colors"
              disabled={loading}
            >
              {cancelLabel}
            </button>
            <button
              onClick={handleStep2Confirm}
              disabled={loading || inputValue.trim().toUpperCase() !== confirmCode}
              className={cn(
                "h-10 px-4 text-sm font-medium rounded-[var(--radius-md)] transition-colors disabled:opacity-50",
                inputValue.trim().toUpperCase() === confirmCode
                  ? "bg-danger text-white hover:bg-red-600"
                  : "bg-muted text-muted-foreground cursor-not-allowed"
              )}
            >
              {loading ? "Đang xử lý..." : confirmLabel}
            </button>
          </div>
        </div>
      )}
    </Modal>
  );
}

function cn(...classes: (string | undefined | null)[]): string {
  return classes.filter(Boolean).join(" ");
}
