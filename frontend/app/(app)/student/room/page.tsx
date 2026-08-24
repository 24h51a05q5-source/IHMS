'use client';

import { useCallback, useEffect, useState } from 'react';
import { BedDouble, Building2, Layers, IndianRupee, Calendar, CheckCircle2, ShieldAlert } from 'lucide-react';
import { PageHeader } from '@/components/dashboard/page-header';
import { CardSkeleton } from '@/components/dashboard/loader';
import { ErrorState } from '@/components/dashboard/states';
import { Badge, Money } from '@/components/dashboard/confirm-dialog';
import { studentsApi } from '@/lib/api/students.api';
import { getCachedData } from '@/lib/api/client';
import type { ApiError } from '@/lib/types';

interface StudentRoomData {
  studentId: string;
  customerCode: string;
  studentName: string;
  hostelName: string;
  hostelId?: string;
  buildingName: string;
  floorNumber: number;
  roomId?: string;
  roomNumber: string;
  bedId?: string;
  bedNumber: string;
  bedStatus: string;
  monthlyRent: number;
  stayDurationMonths: number;
  totalHostelFee: number;
  allocatedAt?: string;
}

export default function StudentRoomPage() {
  const cachedRoom = getCachedData<StudentRoomData>('/student/room');
  const [data, setData] = useState<StudentRoomData | null>(() => cachedRoom);
  const [loading, setLoading] = useState(() => !cachedRoom);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await studentsApi.getMyRoom();
      setData(res);
      setError(null);
    } catch (err) {
      if (!data) {
        setError((err as ApiError)?.message || 'Unable to load your room and bed details.');
      }
    } finally {
      setLoading(false);
    }
  }, [data]);

  useEffect(() => {
    load();
  }, [load]);

  if (loading) {
    return (
      <div className="space-y-5">
        <PageHeader title="My Room & Bed" description="Loading accommodation details..." />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <CardSkeleton className="h-36" />
          <CardSkeleton className="h-36" />
          <CardSkeleton className="h-36" />
        </div>
        <CardSkeleton className="h-64" />
      </div>
    );
  }

  if (error) return <ErrorState message={error} onRetry={load} />;
  if (!data) return null;

  return (
    <div className="space-y-3.5 sm:space-y-5">
      <PageHeader
        title="My Room & Bed"
        description={`Accommodation assigned to Student ID: ${data.studentId || data.customerCode}`}
      />

      {/* Quick Summary Cards */}
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4 sm:gap-4">
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[#FFF3EB] text-[#E87545] border border-[#FDE6D6]">
              <Building2 className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#64748B] uppercase">Hostel</p>
              <p className="truncate text-sm font-black text-[#111827]">{data.hostelName}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[#EFF6FF] text-[#2563EB] border border-[#BFDBFE]">
              <Layers className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#64748B] uppercase">Building & Floor</p>
              <p className="truncate text-sm font-black text-[#111827]">{data.buildingName} · Floor {data.floorNumber}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[#FEF3C7] text-[#C94F18] border border-[#FDE68A]">
              <BedDouble className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#64748B] uppercase">Room & Bed</p>
              <p className="truncate text-sm font-black text-[#111827]">Room {data.roomNumber} · Bed {data.bedNumber}</p>
            </div>
          </div>
        </div>

        <div className="rounded-xl border border-[#CBD5E1] bg-white p-3 sm:p-4">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 sm:h-10 sm:w-10 shrink-0 items-center justify-center rounded-lg bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
              <IndianRupee className="h-4 w-4 sm:h-5 sm:w-5" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-bold text-[#64748B] uppercase">Monthly Rent</p>
              <p className="truncate text-sm font-black text-[#111827]"><Money value={data.monthlyRent} /> / mo</p>
            </div>
          </div>
        </div>
      </div>

      {/* Accommodation Details Card */}
      <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-4 sm:space-y-5">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between border-b border-[#CBD5E1] pb-3">
          <div>
            <h2 className="text-base font-bold text-[#111827] sm:text-lg">Assigned Accommodation Details</h2>
            <p className="text-xs font-semibold text-[#64748B]">Verified and locked by hostel administration</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="success">
              <CheckCircle2 className="mr-1 h-3.5 w-3.5" /> Bed Status: {data.bedStatus || 'OCCUPIED'}
            </Badge>
          </div>
        </div>

        <div className="grid gap-2.5 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <InfoItem label="Student ID / Customer Code" value={data.studentId || data.customerCode} mono />
          <InfoItem label="Hostel Branch" value={data.hostelName} />
          <InfoItem label="Building Name" value={data.buildingName} />
          <InfoItem label="Floor Number" value={`Floor ${data.floorNumber}`} />
          <InfoItem label="Room Number" value={data.roomNumber} highlight />
          <InfoItem label="Bed Number" value={data.bedNumber} highlight />
          <InfoItem label="Monthly Rent / Bed" value={`₹${data.monthlyRent?.toLocaleString('en-IN')}`} />
          <InfoItem label="Stay Duration" value={`${data.stayDurationMonths || 1} Month${(data.stayDurationMonths || 1) > 1 ? 's' : ''}`} />
          <InfoItem label="Total Hostel Fee" value={`₹${data.totalHostelFee?.toLocaleString('en-IN')}`} />
          {data.allocatedAt && (
            <InfoItem
              label="Allocated Date"
              value={new Date(data.allocatedAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}
            />
          )}
        </div>

        <div className="rounded-lg border border-[#CBD5E1] bg-[#F8FAFC] p-3 sm:p-3.5 flex items-start gap-2.5 text-xs text-[#475569]">
          <ShieldAlert className="h-4 w-4 text-[#E87545] shrink-0 mt-0.5" />
          <span>
            Room and bed allocations are managed exclusively by hostel management. For room shift requests or bed queries, please submit a request under the <strong>Complaints & Requests</strong> section.
          </span>
        </div>
      </div>
    </div>
  );
}

function InfoItem({ label, value, mono, highlight }: { label: string; value?: string; mono?: boolean; highlight?: boolean }) {
  return (
    <div className="rounded-lg bg-[#F8FAFC] border border-[#CBD5E1] p-2.5 sm:p-3">
      <dt className="text-[11px] font-bold text-[#64748B] uppercase">{label}</dt>
      <dd className={`mt-0.5 text-sm font-black ${mono ? 'font-mono' : ''} ${highlight ? 'text-[#E87545]' : 'text-[#111827]'}`}>
        {value || '—'}
      </dd>
    </div>
  );
}
