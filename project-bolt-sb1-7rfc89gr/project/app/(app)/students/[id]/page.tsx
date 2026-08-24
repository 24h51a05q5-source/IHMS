'use client';

import { useCallback, useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, Mail, Phone, GraduationCap, User, FileText, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { FileUpload } from '@/components/dashboard/file-upload';
import { studentsApi } from '@/lib/api/students.api';
import type { StudentDetail, StudentDocument, ApiError } from '@/lib/types';

export default function StudentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [student, setStudent] = useState<StudentDetail | null>(null);
  const [docs, setDocs] = useState<StudentDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const s = await studentsApi.getById(params.id);
      setStudent(s);
      setDocs(s.documents || []);
    } catch (err) {
      setError((err as ApiError)?.message || 'Unable to load student.');
    } finally {
      setLoading(false);
    }
  }, [params.id]);

  useEffect(() => { load(); }, [load]);

  if (loading) return <div className="space-y-4"><CardSkeleton className="h-48" /><CardSkeleton className="h-64" /></div>;
  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!student) return null;

  const removeDoc = async (docId: string) => {
    try {
      await studentsApi.removeDocument(student.id, docId);
      setDocs((d) => d.filter((x) => x.id !== docId));
      toast.success('Document removed.');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to remove document.');
    }
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => router.push('/students')} className="-ml-2">
        <ArrowLeft className="mr-1.5 h-4 w-4" /> Back to students
      </Button>

      <PageHeader
        title={student.name}
        description={`${student.customerCode} · ${student.hostelName || '—'}`}
        actions={<Badge variant={student.portalAccess === 'ENABLED' ? 'success' : 'error'}>Portal: {student.portalAccess}</Badge>}
      />

      <div className="grid gap-4 lg:grid-cols-3">
        {/* Profile card */}
        <div className="space-y-4 rounded-xl border border-border bg-card p-5 shadow-sm lg:col-span-1">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-primary/10 text-lg font-semibold text-primary">
              {student.name.split(' ').map((p) => p[0]).slice(0, 2).join('').toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="truncate font-medium">{student.name}</p>
              <p className="truncate text-xs text-muted-foreground">{student.customerCode}</p>
            </div>
          </div>
          <dl className="space-y-2 text-sm">
            <InfoRow icon={Mail} label="Email" value={student.email} />
            <InfoRow icon={Phone} label="Phone" value={student.phone} />
            <InfoRow icon={GraduationCap} label="Course" value={`${student.course || '—'}${student.year ? `, Year ${student.year}` : ''}`} />
            <InfoRow icon={User} label="Guardian" value={student.guardianName ? `${student.guardianName} (${student.guardianPhone || '—'})` : '—'} />
            <InfoRow icon={FileText} label="Room / Bed" value={`${student.roomNumber || '—'} / ${student.bedNumber || '—'}`} />
          </dl>
        </div>

        {/* Fee summary + documents */}
        <div className="space-y-4 lg:col-span-2">
          <div className="grid gap-3 sm:grid-cols-3">
            <FeeBox label="Total Fee" value={student.feeTotal} />
            <FeeBox label="Paid" value={student.feePaid} accent="success" />
            <FeeBox label="Outstanding" value={student.feeOutstanding} accent={student.feeOutstanding ? 'error' : 'success'} />
          </div>

          <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
            <h3 className="mb-3 text-sm font-semibold">Documents</h3>
            {docs.length > 0 && (
              <ul className="mb-4 space-y-2">
                {docs.map((d) => (
                  <li key={d.id} className="flex items-center justify-between rounded-md border border-border px-3 py-2 text-sm">
                    <div className="flex min-w-0 items-center gap-2">
                      <FileText className="h-4 w-4 shrink-0 text-muted-foreground" />
                      <span className="truncate">{d.name}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-rose-600" onClick={() => removeDoc(d.id)} aria-label="Remove document">
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            <FileUpload
              label="Upload a document"
              hint="ID proof, admission letter, etc. (PDF or image, max 5MB)"
              onUpload={async (file) => {
                const doc = await studentsApi.uploadDocument(student.id, file, 'DOCUMENT');
                setDocs((d) => [...d, doc]);
                toast.success('Document uploaded.');
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ icon: Icon, label, value }: { icon: React.ElementType; label: string; value?: string }) {
  return (
    <div className="flex items-center gap-2">
      <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span className="text-muted-foreground">{label}:</span>
      <span className="min-w-0 truncate font-medium">{value || '—'}</span>
    </div>
  );
}

function FeeBox({ label, value, accent = 'neutral' }: { label: string; value?: number; accent?: 'neutral' | 'success' | 'error' }) {
  const colors = { neutral: 'border-border', success: 'border-emerald-200 dark:border-emerald-900', error: 'border-rose-200 dark:border-rose-900' };
  return (
    <div className={`rounded-lg border ${colors[accent]} bg-card p-4`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-semibold"><Money value={value || 0} /></p>
    </div>
  );
}
