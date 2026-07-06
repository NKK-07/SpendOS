import re

with open('apps/dashboard/src/app/submit/page.tsx', 'r', encoding='utf-8') as f:
    code = f.read()

# Change UploadedFile type to hold actual File object
code = code.replace(
    'type UploadedFile = { name: string; size: number; type: string; dataUrl?: string };',
    'type UploadedFile = { file: File; name: string; size: number; type: string; };'
)

code = code.replace(
    'newFiles.push({ name: f.name, size: f.size, type: f.type });',
    'newFiles.push({ file: f, name: f.name, size: f.size, type: f.type });'
)

# Update handleSubmit
new_handle_submit = """const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!amount || parseFloat(amount) <= 0) { setError('Enter a valid amount'); return; }
    if (!category) { setError('Please select a category'); return; }

    setLoading(true);
    try {
      // 1. Create Expense
      const amountPaise = Math.round(parseFloat(amount) * 100);
      const res = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ amountPaise, expenseDate: date, category, description }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || 'Submission failed');
      }
      const expense = await res.json();
      
      // 2. Upload Files to S3 sequentially
      for (const f of files) {
        // Get Pre-signed URL
        const urlRes = await api(`/expenses/${expense.id}/upload-url?filename=${encodeURIComponent(f.name)}&contentType=${encodeURIComponent(f.type)}`);
        if (!urlRes.ok) throw new Error(`Failed to get upload URL for ${f.name}`);
        const { uploadUrl, s3Key } = await urlRes.json();
        
        // Upload directly to S3
        const s3Res = await fetch(uploadUrl, {
          method: 'PUT',
          headers: { 'Content-Type': f.type },
          body: f.file,
        });
        if (!s3Res.ok) throw new Error(`Failed to upload ${f.name} to S3`);
        
        // Confirm Upload
        const confirmRes = await api(`/expenses/${expense.id}/confirm-upload`, {
          method: 'POST',
          body: JSON.stringify({
            s3Key,
            fileName: f.name,
            fileType: f.type,
            fileSize: f.size,
            docType: 'original',
          })
        });
        if (!confirmRes.ok) throw new Error(`Failed to confirm upload for ${f.name}`);
      }
      
      setSuccess(true);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };"""

code = re.sub(r'const handleSubmit = async \(e: React.FormEvent\) => \{[\s\S]*?^\s*};\n', new_handle_submit + '\n', code, flags=re.MULTILINE)

with open('apps/dashboard/src/app/submit/page.tsx', 'w', encoding='utf-8') as f:
    f.write(code)

print("Submit page updated.")
