"use client";

import { useState, useRef } from 'react';
import { useAuth, useApi } from '@/lib/auth';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card } from '@/components/ui/card';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import * as z from 'zod';
import { 
  Plane, Utensils, Paperclip, Laptop, Zap, Package, 
  CheckCircle2, X, Image as ImageIcon, FileText
} from 'lucide-react';

const CATEGORIES = [
  { key: 'travel', icon: Plane, label: 'Travel' },
  { key: 'food', icon: Utensils, label: 'Food' },
  { key: 'office_supplies', icon: Paperclip, label: 'Office' },
  { key: 'software', icon: Laptop, label: 'Software' },
  { key: 'utilities', icon: Zap, label: 'Utilities' },
  { key: 'other', icon: Package, label: 'Other' },
];

type UploadedFile = { file: File; name: string; size: number; type: string; };

const submitSchema = z.object({
  amount: z.string().refine(val => !isNaN(parseFloat(val)) && parseFloat(val) > 0, "Enter a valid amount greater than 0"),
  date: z.string().min(1, "Date is required"),
  category: z.string().min(1, "Please select a category"),
  description: z.string().optional(),
});
type SubmitData = z.infer<typeof submitSchema>;

export default function SubmitExpensePage() {
  const { user } = useAuth();
  const api = useApi();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [files, setFiles] = useState<UploadedFile[]>([]);
  const [fileError, setFileError] = useState('');
  const [submitError, setSubmitError] = useState('');
  const [success, setSuccess] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { register, handleSubmit, setValue, watch, formState: { errors, isSubmitting }, reset } = useForm<SubmitData>({
    resolver: zodResolver(submitSchema),
    defaultValues: {
      date: new Date().toISOString().slice(0, 10),
      category: '',
      amount: '',
      description: '',
    }
  });

  const selectedCategory = watch('category');

  const ALLOWED = ['image/jpeg', 'image/png', 'image/heic', 'application/pdf'];
  const MAX_SIZE = 10 * 1024 * 1024;

  const handleFiles = async (fileList: FileList | null) => {
    if (!fileList) return;
    const newFiles: UploadedFile[] = [];
    for (const f of Array.from(fileList)) {
      if (!ALLOWED.includes(f.type)) {
        setFileError(`${f.name}: file type not allowed. Accepted: JPG, PNG, HEIC, PDF`);
        return;
      }
      if (f.size > MAX_SIZE) {
        setFileError(`${f.name}: file too large. Max 10MB.`);
        return;
      }
      newFiles.push({ file: f, name: f.name, size: f.size, type: f.type });
    }
    setFiles(prev => [...prev, ...newFiles]);
    setFileError('');
  };

  const onSubmit = async (data: SubmitData) => {
    setSubmitError('');
    setUploadProgress(0);

    try {
      // 1. Create Expense
      const amountPaise = Math.round(parseFloat(data.amount) * 100);
      // authFetch (useApi) already attaches a valid UUID v4 Idempotency-Key for
      // every mutating request; do NOT override it with a non-UUID value or the
      // backend idempotency middleware rejects the request with 400.
      const res = await api('/expenses', {
        method: 'POST',
        body: JSON.stringify({ amountPaise, expenseDate: data.date, category: data.category, description: data.description }),
      });
      
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Submission failed');
      }
      const expense = await res.json();
      
      // 2. Upload Files
      if (files.length > 0) {
        let completed = 0;
        const uploadPromises = files.map(async (f) => {
          try {
            const urlRes = await api(`/expenses/${expense.id}/upload-url?filename=${encodeURIComponent(f.name)}&contentType=${encodeURIComponent(f.type)}`);
            if (!urlRes.ok) throw new Error(`Failed to get upload URL for ${f.name}`);
            const { uploadUrl, s3Key } = await urlRes.json();
            
            const s3Res = await fetch(uploadUrl, {
              method: 'PUT',
              headers: { 'Content-Type': f.type },
              body: f.file,
            });
            if (!s3Res.ok) throw new Error(`Failed to upload ${f.name}`);
            
            const confirmRes = await api(`/expenses/${expense.id}/confirm-upload`, {
              method: 'POST',
              body: JSON.stringify({
                s3Key, fileName: f.name, fileType: f.type, fileSize: f.size, docType: 'original',
              })
            });
            if (!confirmRes.ok) throw new Error(`Failed to confirm upload for ${f.name}`);
            
            completed++;
            setUploadProgress(Math.round((completed / files.length) * 100));
          } catch (err: any) {
            // Note: If an upload fails, the expense is already created. 
            // In a production environment, we'd queue this for retry or mark the expense as "Incomplete".
            throw new Error(`Upload failed for ${f.name}: ${err.message}`);
          }
        });

        await Promise.all(uploadPromises);
      }
      
      queryClient.invalidateQueries({ queryKey: ['expenses'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      
      setSuccess(true);
    } catch (err: any) {
      setSubmitError(err.message);
    }
  };

  if (success) {
    return (
      <div className="max-w-lg mx-auto animate-in fade-in zoom-in duration-300">
        <Card className="text-center p-8">
          <CheckCircle2 size={64} className="mx-auto mb-4 text-emerald-500" />
          <h2 className="text-xl font-bold text-slate-900 dark:text-slate-100 mb-1">Submitted!</h2>
          <p className="text-slate-500 dark:text-slate-400 text-sm">Your finance team has been notified.</p>
          <div className="flex gap-3 mt-8 justify-center">
            <Button
              variant="outline"
              onClick={() => { 
                setSuccess(false); 
                setFiles([]); 
                reset(); 
              }}
            >
              Submit another
            </Button>
            <Link 
              href="/expenses" 
              className="inline-flex items-center justify-center rounded-xl font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500 bg-emerald-600 text-white hover:bg-emerald-500 shadow-sm shadow-emerald-500/20 h-10 py-2 px-4 text-sm"
            >
              View submission &rarr;
            </Link>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="max-w-lg mx-auto pb-12 animate-in fade-in duration-300">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Submit Expense</h1>
        <p className="text-slate-500 dark:text-slate-400 text-sm mt-0.5">Fill in the details and upload your receipt.</p>
      </div>

      <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
        {/* 1. Upload */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Receipt / Document</label>
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={e => e.preventDefault()}
            onDrop={e => { e.preventDefault(); handleFiles(e.dataTransfer.files); }}
            className="border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-emerald-500 dark:hover:border-emerald-500 rounded-2xl p-8 text-center cursor-pointer transition-all group bg-slate-50/50 dark:bg-slate-900/50"
            role="button"
            tabIndex={0}
            onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && fileInputRef.current?.click()}
            aria-label="Upload receipt files"
          >
            <Paperclip size={32} className="mx-auto mb-3 text-slate-400 group-hover:text-emerald-500 transition-colors" />
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300 group-hover:text-slate-900 dark:group-hover:text-slate-100 transition-colors">
              Tap to upload or drag & drop
            </p>
            <p className="text-xs text-slate-500 mt-2">JPG, PNG, HEIC, PDF &middot; Max 10MB each</p>
          </div>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".jpg,.jpeg,.png,.heic,.pdf,image/jpeg,image/png,image/heic,application/pdf"
            className="hidden"
            onChange={e => handleFiles(e.target.files)}
          />
          {fileError && (
            <p className="text-xs text-red-500 mt-2 font-medium" aria-live="polite">{fileError}</p>
          )}
          {files.length > 0 && (
            <div className="mt-4 space-y-2">
              {files.map((f, i) => (
                <div key={i} className="flex items-center gap-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-3 shadow-sm">
                  <div className="text-slate-400 bg-slate-100 dark:bg-slate-800 p-2 rounded-lg">
                    {f.type.includes('pdf') ? <FileText size={20} /> : <ImageIcon size={20} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100 truncate">{f.name}</p>
                    <p className="text-xs text-slate-500">{(f.size / 1024).toFixed(0)} KB</p>
                  </div>
                  <button type="button" onClick={() => setFiles(prev => prev.filter((_, j) => j !== i))}
                    className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-950/30 rounded-lg transition-colors"
                    aria-label={`Remove ${f.name}`}>
                    <X size={16} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* 2. Amount */}
        <div>
          <label htmlFor="amount" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Amount (₹)</label>
          <div className="relative">
            <span className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 font-semibold" aria-hidden="true">₹</span>
            <input
              id="amount"
              type="number"
              inputMode="decimal"
              placeholder="0.00"
              min="0.01"
              step="0.01"
              className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl pl-9 pr-4 py-3 text-lg font-bold focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 placeholder-slate-300 dark:placeholder-slate-600 transition-colors"
              aria-invalid={!!errors.amount}
              {...register("amount")}
            />
          </div>
          {errors.amount && <p className="text-xs text-red-500 mt-1.5 font-medium">{errors.amount.message}</p>}
        </div>

        {/* 3. Date */}
        <div>
          <label htmlFor="date" className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Date of Expense</label>
          <input
            id="date"
            type="date"
            max={new Date().toISOString().slice(0, 10)}
            className="w-full bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-900 dark:text-slate-100 rounded-xl px-4 py-3 focus:outline-none focus:ring-2 focus:ring-emerald-500/50 focus:border-emerald-500 transition-colors"
            aria-invalid={!!errors.date}
            {...register("date")}
          />
          {errors.date && <p className="text-xs text-red-500 mt-1.5 font-medium">{errors.date.message}</p>}
        </div>

        {/* 4. Category */}
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Category</label>
          <div className="flex gap-2 flex-wrap" role="radiogroup" aria-label="Select an expense category">
            {CATEGORIES.map(c => {
              const Icon = c.icon;
              const isSelected = selectedCategory === c.key;
              return (
                <button
                  key={c.key}
                  type="button"
                  role="radio"
                  aria-checked={isSelected}
                  onClick={() => setValue("category", c.key, { shouldValidate: true })}
                  className={`flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium border transition-all
                    ${isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-500/10 border-emerald-500 text-emerald-700 dark:text-emerald-400 shadow-sm'
                      : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
                    }`}
                >
                  <Icon size={16} />
                  <span>{c.label}</span>
                </button>
              );
            })}
          </div>
          {errors.category && <p className="text-xs text-red-500 mt-1.5 font-medium">{errors.category.message}</p>}
        </div>

        {/* 5. Description */}
        <Input
          label="Description"
          hint="Optional: What was this for?"
          placeholder="e.g. Client lunch at Dishoom"
          error={errors.description?.message}
          {...register("description")}
        />

        {submitError && (
          <div className="bg-red-50 dark:bg-red-950/50 border border-red-200 dark:border-red-900/50 text-red-600 dark:text-red-400 text-sm rounded-xl px-4 py-3 flex items-center gap-2" aria-live="polite">
            <span aria-hidden="true">⚠</span> {submitError}
          </div>
        )}

        {isSubmitting && files.length > 0 && (
          <div className="space-y-1">
            <div className="flex justify-between text-xs text-slate-500">
              <span>Uploading receipts...</span>
              <span>{uploadProgress}%</span>
            </div>
            <div 
              className="h-2 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={uploadProgress}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div 
                className="h-full bg-emerald-500 transition-all duration-300"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
          </div>
        )}

        <Button
          type="submit"
          isLoading={isSubmitting}
          className="w-full py-6 text-base"
        >
          Submit Expense &rarr;
        </Button>
      </form>
    </div>
  );
}
