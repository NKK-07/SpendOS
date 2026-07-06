"use client";

import React, { useState } from "react";
import FocusTrap from 'focus-trap-react';

interface ReasonModalProps {
  isOpen: boolean;
  title: string;
  placeholder?: string;
  submitLabel?: string;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

export function ReasonModal({
  isOpen,
  title,
  placeholder = "Enter reason...",
  submitLabel = "Submit",
  onClose,
  onSubmit,
}: ReasonModalProps) {
  const [reason, setReason] = useState("");

  if (!isOpen) return null;

  return (
    <FocusTrap>
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm" role="dialog" aria-modal="true" aria-labelledby="reason-modal-title">
        <div className="bg-white dark:bg-neutral-900 rounded-lg shadow-xl w-full max-w-md p-6 border border-neutral-200 dark:border-neutral-800">
          <h2 id="reason-modal-title" className="text-xl font-semibold mb-4 text-neutral-900 dark:text-neutral-100">{title}</h2>
        <textarea
          autoFocus
          className="w-full h-32 p-3 border rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-neutral-50 dark:bg-neutral-800 border-neutral-300 dark:border-neutral-700 text-neutral-900 dark:text-neutral-100 resize-none"
          placeholder={placeholder}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
        />
        <div className="flex justify-end gap-3 mt-6">
          <button
            className="px-4 py-2 text-sm font-medium text-neutral-600 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-800 rounded-md transition-colors"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors disabled:opacity-50"
            disabled={!reason.trim()}
            onClick={() => {
              onSubmit(reason.trim());
              setReason("");
            }}
          >
            {submitLabel}
          </button>
        </div>
      </div>
    </div>
    </FocusTrap>
  );
}
