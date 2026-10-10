"use client";

import { type FormEvent, useId, useState } from "react";

import { Button } from "./button";
import { Dialog } from "./dialog";
import { Field, Textarea, describedBy } from "./field";
import { Alert } from "./feedback";

const MIN_REASON_LENGTH = 3;
const DEFAULT_MAX_REASON_LENGTH = 255;

type ReasonDialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  description?: string;
  label?: string;
  confirmLabel: string;
  variant?: "primary" | "danger";
  maxLength?: number;
  isPending: boolean;
  error?: string;
  onConfirm: (reason: string) => void;
};

export function ReasonDialog({
  open,
  onClose,
  title,
  description,
  label = "Lý do",
  confirmLabel,
  variant = "primary",
  maxLength = DEFAULT_MAX_REASON_LENGTH,
  isPending,
  error,
  onConfirm,
}: ReasonDialogProps) {
  const formId = useId();
  const fieldId = useId();
  const [reason, setReason] = useState("");
  const [validationError, setValidationError] = useState<string>();

  function handleClose() {
    setReason("");
    setValidationError(undefined);
    onClose();
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < MIN_REASON_LENGTH) {
      setValidationError(`Vui lòng nhập lý do (ít nhất ${MIN_REASON_LENGTH} ký tự).`);
      return;
    }
    if (trimmed.length > maxLength) {
      setValidationError(`Lý do tối đa ${maxLength} ký tự.`);
      return;
    }
    setValidationError(undefined);
    onConfirm(trimmed);
  }

  return (
    <Dialog
      open={open}
      onClose={handleClose}
      title={title}
      description={description}
      footer={
        <>
          <Button variant="secondary" onClick={handleClose} disabled={isPending}>
            Hủy bỏ
          </Button>
          <Button type="submit" form={formId} variant={variant} disabled={isPending}>
            {isPending ? "Đang xử lý…" : confirmLabel}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={submit} className="space-y-3" noValidate>
        {error ? <Alert tone="danger">{error}</Alert> : null}
        <Field id={fieldId} label={label} error={validationError}>
          <Textarea
            id={fieldId}
            rows={3}
            maxLength={maxLength}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            aria-invalid={validationError ? true : undefined}
            aria-describedby={describedBy(fieldId, validationError)}
          />
        </Field>
      </form>
    </Dialog>
  );
}
