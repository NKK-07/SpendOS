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

  // PUT goes straight to the storage URL. In dev this is the API's local-S3
  // route on a different origin (:3000) than the dashboard (:3002), and it
  // authenticates via the httpOnly accessToken cookie — so credentials MUST be
  // included or the cross-origin PUT arrives without the cookie and 401s. (Real
  // S3 pre-signed URLs ignore credentials, so this is safe in production too.)
  const putRes = await fetch(uploadUrl, {
    method: 'PUT',
    headers: { 'Content-Type': file.type },
    body: file,
    credentials: 'include',
  });
  if (!putRes.ok) {
    throw new Error(`Failed to upload ${file.name} (storage returned ${putRes.status})`);
  }

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
