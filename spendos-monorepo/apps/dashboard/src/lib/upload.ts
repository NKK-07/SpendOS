// Shared 3-step expense-document upload used by both the submit page (receipts)
// and the expense detail page (proofs): request a presigned URL, PUT the bytes
// directly to storage, then confirm so the backend records the document. When
// docType is 'proof', confirm-upload also advances the expense to proof_submitted.
type ApiFetch = (path: string, options?: RequestInit) => Promise<Response>;

export async function uploadExpenseDocument(
  api: ApiFetch,
  expenseId: string,
  file: File,
  docType: 'original' | 'proof',
): Promise<void> {
  const urlRes = await api(
    `/expenses/${expenseId}/upload-url?filename=${encodeURIComponent(file.name)}&contentType=${encodeURIComponent(file.type)}`,
  );
  if (!urlRes.ok) {
    const e = await urlRes.json().catch(() => ({}));
    throw new Error(e.error || `Failed to get upload URL for ${file.name}`);
  }
  const { uploadUrl, s3Key } = await urlRes.json();

  // PUT goes straight to the (pre-signed) storage URL — not through the API,
  // so no auth/CSRF headers here.
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
  });
  if (!putRes.ok) throw new Error(`Failed to upload ${file.name}`);

  const confirmRes = await api(`/expenses/${expenseId}/confirm-upload`, {
    method: 'POST',
    body: JSON.stringify({
      s3Key,
      fileName: file.name,
      fileType: file.type,
      fileSize: file.size,
      docType,
    }),
  });
  if (!confirmRes.ok) {
    const e = await confirmRes.json().catch(() => ({}));
    throw new Error(e.error || `Failed to confirm upload for ${file.name}`);
  }
}
