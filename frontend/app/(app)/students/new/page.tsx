'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  UserCheck,
} from 'lucide-react';
import { toast } from 'sonner';
import { PageHeader } from '@/components/dashboard/page-header';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { PageErrorBoundary } from '@/components/dashboard/error-boundary';
import { studentsApi, type CreateStudentInput } from '@/lib/api/students.api';
import { hostelsApi } from '@/lib/api/hostels.api';
import { roomsApi } from '@/lib/api/rooms.api';
import { useAuth } from '@/lib/auth/auth-context';
import type { ApiError, Room, Bed } from '@/lib/types';

function NewStudentPageContent() {
  const router = useRouter();
  const { currentBranchId } = useAuth();
  const [loading, setLoading] = useState(false);
  const [loadingRooms, setLoadingRooms] = useState(false);

  // Data sources
  const [branches, setBranches] = useState<any[]>([]);
  const [allRooms, setAllRooms] = useState<Room[]>([]);

  // Dependent dropdown selections
  const [selectedHostelId, setSelectedHostelId] = useState<string>(currentBranchId || '');
  const [selectedBuilding, setSelectedBuilding] = useState<string>('');
  const [selectedFloor, setSelectedFloor] = useState<string>('');
  const [selectedRoomId, setSelectedRoomId] = useState<string>('');
  const [selectedBedId, setSelectedBedId] = useState<string>('');
  const [availableBeds, setAvailableBeds] = useState<Bed[]>([]);
  const [loadingBeds, setLoadingBeds] = useState(false);

  // Fee calculation & Payment Plan state
  const [monthlyRent, setMonthlyRent] = useState<number>(0);
  const [stayDurationMonths, setStayDurationMonths] = useState<number>(10);
  const [paymentPlan, setPaymentPlan] = useState<'MONTHLY' | 'ONE_TIME'>('MONTHLY');
  const [monthlyDueDay, setMonthlyDueDay] = useState<number>(5);
  const [allowAdvancePayment, setAllowAdvancePayment] = useState<boolean>(false);
  const totalHostelFee = monthlyRent * stayDurationMonths;

  // Form details - Simplified to essential fields only
  const [form, setForm] = useState<CreateStudentInput>({
    name: '',
    phone: '',
    email: '',
    gender: 'MALE',
    course: 'B.Tech',
    year: 1,
    guardianName: '',
    guardianRelation: 'Parent',
    guardianPhone: '',
    guardianAddress: '',
    hostelId: currentBranchId || '',
  });

  const set = <K extends keyof CreateStudentInput>(k: K, v: CreateStudentInput[K]) =>
    setForm((f) => ({ ...f, [k]: v }));

  // Load Hostels on mount
  useEffect(() => {
    async function loadHostels() {
      try {
        const hList = await hostelsApi.list();
        setBranches(hList || []);
        if (hList && hList.length > 0 && !selectedHostelId) {
          setSelectedHostelId(hList[0].id);
          set('hostelId', hList[0].id);
        }
      } catch (err) {
        toast.error('Failed to load hostel branches.');
      }
    }
    loadHostels();
  }, [selectedHostelId]);

  // Load Rooms whenever selectedHostelId changes
  const loadHostelRooms = useCallback(async (hostelId: string) => {
    if (!hostelId) return;
    setLoadingRooms(true);
    try {
      const res = await roomsApi.list({ hostelId, pageSize: 100 });
      const rooms = res?.items || [];
      setAllRooms(rooms);

      // Auto-select first building if available
      const buildings = Array.from(new Set(rooms.map((r) => r.buildingName || 'Main Building')));
      if (buildings.length > 0) {
        setSelectedBuilding(buildings[0]);
      } else {
        setSelectedBuilding('');
      }
      setSelectedFloor('');
      setSelectedRoomId('');
      setSelectedBedId('');
      setAvailableBeds([]);
      setMonthlyRent(0);
    } catch (err) {
      toast.error('Failed to load rooms for selected hostel.');
    } finally {
      setLoadingRooms(false);
    }
  }, []);

  useEffect(() => {
    if (selectedHostelId) {
      set('hostelId', selectedHostelId);
      loadHostelRooms(selectedHostelId);
    }
  }, [selectedHostelId, loadHostelRooms]);

  // Derive buildings for selected hostel
  const availableBuildings = Array.from(new Set(allRooms.map((r) => r.buildingName || 'Main Building')));

  // Derive floors for selected hostel & building
  const availableFloors = Array.from(
    new Set(
      allRooms
        .filter((r) => (r.buildingName || 'Main Building') === selectedBuilding)
        .map((r) => String(r.floorNumber || r.floor || 1))
    )
  ).sort((a, b) => Number(a) - Number(b));

  // Automatically select first floor when building changes
  useEffect(() => {
    if (availableFloors.length > 0 && !availableFloors.includes(selectedFloor)) {
      setSelectedFloor(availableFloors[0]);
    }
  }, [selectedBuilding, availableFloors, selectedFloor]);

  // Derive rooms for selected hostel, building, and floor
  const filteredRooms = allRooms.filter(
    (r) =>
      (r.buildingName || 'Main Building') === selectedBuilding &&
      String(r.floorNumber || r.floor || 1) === selectedFloor
  );

  // Automatically select first room with available beds or first room
  useEffect(() => {
    if (filteredRooms.length > 0) {
      const roomWithAvailable = filteredRooms.find((r) => (r.available || r.availableBeds || 0) > 0) || filteredRooms[0];
      if (!selectedRoomId || !filteredRooms.some((r) => r.id === selectedRoomId)) {
        setSelectedRoomId(roomWithAvailable.id);
      }
    } else {
      setSelectedRoomId('');
    }
  }, [filteredRooms, selectedRoomId]);

  // Fetch Beds for the selected room
  const loadRoomBeds = useCallback(async (roomId: string) => {
    if (!roomId) {
      setAvailableBeds([]);
      setSelectedBedId('');
      setMonthlyRent(0);
      return;
    }
    setLoadingBeds(true);
    try {
      const beds = await roomsApi.getBeds(roomId, 'AVAILABLE');
      const avail = (beds || []).filter((b) => b.status === 'AVAILABLE');
      setAvailableBeds(avail);

      if (avail.length > 0) {
        const firstBed = avail[0];
        setSelectedBedId(firstBed.id);
        const rent = firstBed.monthlyRate || firstBed.monthlyFee || 8000;
        setMonthlyRent(rent);
      } else {
        setSelectedBedId('');
        setMonthlyRent(0);
      }
    } catch (err) {
      toast.error('Failed to load beds for the selected room.');
    } finally {
      setLoadingBeds(false);
    }
  }, []);

  useEffect(() => {
    if (selectedRoomId) {
      loadRoomBeds(selectedRoomId);
    }
  }, [selectedRoomId, loadRoomBeds]);

  // Handle bed selection change
  const handleBedSelect = (bedId: string) => {
    setSelectedBedId(bedId);
    const bed = availableBeds.find((b) => b.id === bedId);
    if (bed) {
      const currentRoom = allRooms.find((r) => r.id === selectedRoomId);
      const rent = bed.monthlyRate || bed.monthlyFee || currentRoom?.monthlyRentPerBed || currentRoom?.monthlyRate || 8000;
      setMonthlyRent(rent);
    }
  };

  // Submit Admission
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!form.name?.trim()) {
      toast.error('Student full name is required.');
      return;
    }
    if (!form.phone?.trim()) {
      toast.error('Student contact phone number is required.');
      return;
    }
    if (!form.email?.trim()) {
      toast.error('Student email address is required.');
      return;
    }
    if (!form.guardianName?.trim() || !form.guardianPhone?.trim()) {
      toast.error('Guardian name and contact phone are required.');
      return;
    }
    if (!selectedBedId) {
      toast.error('Please select an available bed before admitting the student.');
      return;
    }

    setLoading(true);
    try {
      const payload: CreateStudentInput = {
        name: form.name.trim(),
        fullName: form.name.trim(),
        phone: form.phone.trim(),
        email: form.email.trim(),
        gender: form.gender,
        course: form.course?.trim() || 'B.Tech',
        year: Number(form.year || 1),
        guardianName: form.guardianName.trim(),
        guardianRelation: form.guardianRelation || 'Parent',
        guardianPhone: form.guardianPhone.trim(),
        guardianAddress: form.guardianAddress?.trim() || '',
        hostelId: selectedHostelId,
        branchId: selectedHostelId,
        buildingName: selectedBuilding,
        floorNumber: Number(selectedFloor),
        roomId: selectedRoomId,
        bedId: selectedBedId,
        monthlyBedRent: monthlyRent,
        stayDurationMonths: Number(stayDurationMonths),
        totalHostelFee: totalHostelFee,
        feeTotal: totalHostelFee,
        paymentPlan,
        monthlyDueDay,
        allowAdvancePayment,
      };

      const res = await studentsApi.create(payload);
      toast.success(`Student ${res.customerCode || form.name} admitted successfully! Bed allocated.`);
      router.push('/students');
    } catch (err) {
      toast.error((err as ApiError)?.message || 'Unable to admit student. Please check bed availability.');
    } finally {
      setLoading(false);
    }
  };

  const selectedBed = availableBeds.find((b) => b.id === selectedBedId);
  const selectedRoom = allRooms.find((r) => r.id === selectedRoomId);
  const selectedBranchObj = branches.find((b) => b.id === selectedHostelId);

  return (
    <div className="space-y-4 sm:space-y-5 w-full pb-8">
      <Button variant="ghost" size="sm" onClick={() => router.push('/students')} className="-ml-2 gap-1.5 font-bold text-slate-700 hover:text-black">
        <ArrowLeft className="h-4 w-4" /> Back to students
      </Button>

      <PageHeader
        title="Admit New Student"
        description="Allocate hostel accommodation, assign an available bed with automatic rent calculation, and create student profile."
      />

      <form onSubmit={submit} className="space-y-4 sm:space-y-5 w-full">
        {/* STEP 1: PERSONAL DETAILS SECTION */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-4 sm:p-6 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
            <div className="flex h-7 w-7 sm:h-8 sm:w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-200 font-black text-sm">
              1
            </div>
            <div>
              <h3 className="font-black text-base sm:text-lg text-slate-950">Personal Details</h3>
              <p className="text-xs font-bold text-slate-700">Basic student identification and academic program</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <div className="xl:col-span-2">
              <Field label="Full Name" required>
                <Input
                  value={form.name}
                  onChange={(e) => set('name', e.target.value)}
                  placeholder="e.g. Rahul Sharma"
                  required
                />
              </Field>
            </div>

            <div className="xl:col-span-2">
              <Field label="Contact Phone" required>
                <Input
                  value={form.phone}
                  onChange={(e) => set('phone', e.target.value)}
                  placeholder="+91 98765 43210"
                  required
                />
              </Field>
            </div>

            <div className="xl:col-span-2">
              <Field label="Email Address" required>
                <Input
                  type="email"
                  value={form.email}
                  onChange={(e) => set('email', e.target.value)}
                  placeholder="rahul.sharma@example.com"
                  required
                />
              </Field>
            </div>

            <div className="xl:col-span-2">
              <Field label="Gender">
                <Select value={form.gender} onValueChange={(v: any) => set('gender', v)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="MALE">Male</SelectItem>
                    <SelectItem value="FEMALE">Female</SelectItem>
                    <SelectItem value="OTHER">Other</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>

            <div className="xl:col-span-2">
              <Field label="Course / Program">
                <Input
                  value={form.course}
                  onChange={(e) => set('course', e.target.value)}
                  placeholder="e.g. B.Tech Computer Science"
                />
              </Field>
            </div>

            <div className="xl:col-span-2">
              <Field label="Academic Year">
                <Select value={String(form.year || 1)} onValueChange={(v) => set('year', Number(v))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {[1, 2, 3, 4].map((y) => (
                      <SelectItem key={y} value={String(y)}>Year {y}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>
        </div>

        {/* STEP 2: GUARDIAN DETAILS SECTION */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 space-y-5">
          <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3.5">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-50 text-orange-600 border border-orange-200 font-black text-sm">
              2
            </div>
            <div>
              <h3 className="font-black text-lg text-slate-950">Guardian Details</h3>
              <p className="text-xs font-bold text-slate-700">Emergency contact and permanent guardian records</p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <Field label="Guardian Name" required>
              <Input
                value={form.guardianName}
                onChange={(e) => set('guardianName', e.target.value)}
                placeholder="e.g. Ramesh Sharma"
                required
              />
            </Field>

            <Field label="Relationship">
              <Select value={form.guardianRelation || 'Parent'} onValueChange={(v) => set('guardianRelation', v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="Father">Father</SelectItem>
                  <SelectItem value="Mother">Mother</SelectItem>
                  <SelectItem value="Parent">Parent</SelectItem>
                  <SelectItem value="Guardian">Legal Guardian</SelectItem>
                  <SelectItem value="Relative">Relative</SelectItem>
                </SelectContent>
              </Select>
            </Field>

            <Field label="Guardian Phone" required>
              <Input
                value={form.guardianPhone}
                onChange={(e) => set('guardianPhone', e.target.value)}
                placeholder="+91 98765 43210"
                required
              />
            </Field>

            <Field label="Permanent Address">
              <Input
                value={form.guardianAddress}
                onChange={(e) => set('guardianAddress', e.target.value)}
                placeholder="Plot / Street / City / Pincode"
              />
            </Field>
          </div>
        </div>

        {/* STEP 3: ACCOMMODATION DETAILS SECTION */}
        <div className="rounded-xl border border-[#CBD5E1] bg-white p-6 space-y-6">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3.5">
            <div className="flex items-center gap-2.5">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-[#E87545] text-white font-black text-sm">
                3
              </div>
              <div>
                <h3 className="font-black text-lg text-slate-950 flex items-center gap-2">
                  Accommodation Details
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-orange-50 text-orange-700 border border-orange-300 font-extrabold uppercase tracking-wider">
                    Required
                  </span>
                </h3>
                <p className="text-xs font-bold text-slate-700">Select hostel, building, floor, room, and available bed</p>
              </div>
            </div>
            {loadingRooms && (
              <span className="flex items-center gap-1.5 text-xs text-slate-700 font-bold">
                <Loader2 className="h-3.5 w-3.5 animate-spin text-primary" /> Loading rooms...
              </span>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {/* Step 1: Select Hostel */}
            <Field label="1. Hostel Branch" required>
              <Select value={selectedHostelId} onValueChange={setSelectedHostelId}>
                <SelectTrigger className="font-medium">
                  <SelectValue placeholder="Select Hostel Branch" />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name} ({b.code || b.branchCode})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Step 2: Select Building */}
            <Field label="2. Building" required>
              <Select
                value={selectedBuilding}
                onValueChange={(val) => {
                  setSelectedBuilding(val);
                  setSelectedFloor('');
                  setSelectedRoomId('');
                  setSelectedBedId('');
                }}
                disabled={availableBuildings.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={availableBuildings.length === 0 ? 'No buildings' : 'Select Building'} />
                </SelectTrigger>
                <SelectContent>
                  {availableBuildings.map((b) => (
                    <SelectItem key={b} value={b}>
                      {b}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Step 3: Select Floor */}
            <Field label="3. Floor" required>
              <Select
                value={selectedFloor}
                onValueChange={(val) => {
                  setSelectedFloor(val);
                  setSelectedRoomId('');
                  setSelectedBedId('');
                }}
                disabled={availableFloors.length === 0}
              >
                <SelectTrigger>
                  <SelectValue placeholder={availableFloors.length === 0 ? 'No floors' : 'Select Floor'} />
                </SelectTrigger>
                <SelectContent>
                  {availableFloors.map((f) => (
                    <SelectItem key={f} value={f}>
                      Floor {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>

            {/* Step 4: Select Room */}
            <Field label="4. Room Number" required>
              <Select
                value={selectedRoomId}
                onValueChange={(val) => {
                  setSelectedRoomId(val);
                  setSelectedBedId('');
                }}
                disabled={filteredRooms.length === 0}
              >
                <SelectTrigger className="font-medium">
                  <SelectValue placeholder={filteredRooms.length === 0 ? 'No rooms' : 'Select Room'} />
                </SelectTrigger>
                <SelectContent>
                  {filteredRooms.map((r) => {
                    const avail = r.available || r.availableBeds || 0;
                    return (
                      <SelectItem key={r.id} value={r.id}>
                        Room {r.roomNumber || r.number} ({r.roomType || r.type} • {avail} Available)
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </Field>
          </div>

          {/* Step 5: Select Available Bed */}
          <div className="grid gap-4 sm:grid-cols-3 pt-2">
            <div className="sm:col-span-2">
              <Field label="5. Select Available Bed *" required>
                <Select
                  value={selectedBedId}
                  onValueChange={handleBedSelect}
                  disabled={loadingBeds || availableBeds.length === 0}
                >
                  <SelectTrigger className="h-10 font-mono font-medium">
                    <SelectValue
                      placeholder={
                        loadingBeds
                          ? 'Loading available beds...'
                          : availableBeds.length === 0
                          ? 'No Available Beds in this Room'
                          : 'Select an Available Bed'
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {availableBeds.map((bed) => {
                      const rent = bed.monthlyRate || bed.monthlyFee || selectedRoom?.monthlyRentPerBed || selectedRoom?.monthlyRate || 8000;
                      return (
                        <SelectItem key={bed.id} value={bed.id} className="font-mono">
                          <span className="font-bold text-foreground">{bed.bedCode || `Bed ${bed.bedNumber || bed.number}`}</span>
                          <span className="text-emerald-600 dark:text-emerald-400 font-semibold ml-2">
                            — ₹{rent.toLocaleString('en-IN')}/month
                          </span>
                        </SelectItem>
                      );
                    })}
                  </SelectContent>
                </Select>
                {availableBeds.length === 0 && !loadingBeds && selectedRoomId && (
                  <p className="text-xs text-destructive flex items-center gap-1 mt-1.5 font-medium">
                    <AlertCircle className="h-3.5 w-3.5" /> All beds in this room are currently occupied or in maintenance. Please select another room.
                  </p>
                )}
              </Field>
            </div>

            {/* Stay Duration in Months */}
            <div>
              <Field label="Stay Duration / Months" required>
                <Select
                  value={String(stayDurationMonths)}
                  onValueChange={(val) => setStayDurationMonths(Number(val))}
                >
                  <SelectTrigger className="h-10 font-semibold">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="1">1 Month</SelectItem>
                    <SelectItem value="3">3 Months</SelectItem>
                    <SelectItem value="6">6 Months</SelectItem>
                    <SelectItem value="10">10 Months (Academic Session)</SelectItem>
                    <SelectItem value="12">12 Months (Full Year)</SelectItem>
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </div>

          {/* Read-Only Automatic Pricing Fields */}
          <div className="grid gap-4 sm:grid-cols-2 pt-1 border-t border-border/80">
            <Field label="Monthly Rent / Bed (Auto-Fetched • Read-Only)">
              <div className="relative">
                <Input
                  readOnly
                  disabled
                  value={monthlyRent > 0 ? `₹${monthlyRent.toLocaleString('en-IN')}` : '₹0'}
                  className="bg-secondary/40 font-mono font-bold text-foreground cursor-not-allowed h-10 pl-3"
                />
                <span className="absolute right-3 top-2.5 text-[11px] text-muted-foreground uppercase font-semibold">
                  Locked
                </span>
              </div>
            </Field>

            <Field label="Total Hostel Fee (Auto-Calculated • Read-Only)">
              <div className="relative">
                <Input
                  readOnly
                  disabled
                  value={totalHostelFee > 0 ? `₹${totalHostelFee.toLocaleString('en-IN')}` : '₹0'}
                  className="bg-secondary/40 font-mono font-bold text-primary cursor-not-allowed h-10 pl-3 text-base"
                />
                <span className="absolute right-3 top-2.5 text-[11px] text-primary uppercase font-bold">
                  {stayDurationMonths} Mo × ₹{monthlyRent.toLocaleString('en-IN')}
                </span>
              </div>
            </Field>
          </div>

          {/* Step 6: Owner-Controlled Payment Plan */}
          <div className="rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-foreground">
                Payment Plan & Installment Structure *
              </span>
              <span className="text-[11px] text-muted-foreground">Admin/Owner Managed</span>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <div
                onClick={() => setPaymentPlan('MONTHLY')}
                className={`cursor-pointer rounded-lg border p-3 transition-all ${
                  paymentPlan === 'MONTHLY'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">Monthly Payment Plan</span>
                  <span className="rounded-md bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold text-primary">Recommended</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Generates {stayDurationMonths} monthly installments of ₹{monthlyRent.toLocaleString('en-IN')}/mo
                </p>
              </div>

              <div
                onClick={() => setPaymentPlan('ONE_TIME')}
                className={`cursor-pointer rounded-lg border p-3 transition-all ${
                  paymentPlan === 'ONE_TIME'
                    ? 'border-primary bg-primary/5 text-foreground'
                    : 'border-border text-muted-foreground hover:border-primary/50'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="font-bold text-xs">One-Time Full Payment</span>
                  <span className="text-[10px] font-mono text-muted-foreground">Single Installment</span>
                </div>
                <p className="mt-1 text-[11px] text-muted-foreground">
                  Collects full ₹{totalHostelFee.toLocaleString('en-IN')} upfront
                </p>
              </div>
            </div>

            {paymentPlan === 'MONTHLY' && (
              <div className="grid gap-4 sm:grid-cols-2 pt-2 border-t border-border/60">
                <Field label="Monthly Due Date">
                  <Select value={String(monthlyDueDay)} onValueChange={(v) => setMonthlyDueDay(Number(v))}>
                    <SelectTrigger className="h-9 font-medium text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="1">1st of Every Month</SelectItem>
                      <SelectItem value="5">5th of Every Month</SelectItem>
                      <SelectItem value="10">10th of Every Month</SelectItem>
                      <SelectItem value="15">15th of Every Month</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>

                <Field label="Allow Advance Payments">
                  <Select
                    value={allowAdvancePayment ? 'YES' : 'NO'}
                    onValueChange={(v) => setAllowAdvancePayment(v === 'YES')}
                  >
                    <SelectTrigger className="h-9 font-medium text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="NO">Disabled (Current installment only)</SelectItem>
                      <SelectItem value="YES">Enabled (Can pay future installments)</SelectItem>
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {/* Clear Fee Summary Card */}
          {selectedBed && (
            <div className="rounded-xl border border-[#CBD5E1] bg-[#F8FAFC] p-4.5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase tracking-wider text-[#111827] flex items-center gap-1.5">
                  <Sparkles className="h-3.5 w-3.5 text-[#E87545]" /> Admission & Accommodation Summary
                </span>
                <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-[#E8F5ED] text-[#087A45] border border-[#B4E2C7]">
                  <CheckCircle2 className="h-3.5 w-3.5" /> Bed Ready for Allocation
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pt-1">
                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">Selected Bed</span>
                  <p className="font-mono font-bold text-sm text-foreground">
                    {selectedBed.bedCode || `Bed ${selectedBed.bedNumber || selectedBed.number}`}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    Room {selectedRoom?.roomNumber} • Floor {selectedFloor}
                  </p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">Monthly Rent</span>
                  <p className="font-mono font-bold text-sm text-foreground">
                    ₹{monthlyRent.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[11px] text-muted-foreground">Per Bed / Month</p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">Stay Duration</span>
                  <p className="font-bold text-sm text-foreground">
                    {stayDurationMonths} Month{stayDurationMonths > 1 ? 's' : ''}
                  </p>
                  <p className="text-[11px] text-muted-foreground">{selectedBranchObj?.name || 'Main Hostel'}</p>
                </div>

                <div className="space-y-0.5">
                  <span className="text-[11px] text-muted-foreground">Total Hostel Fee</span>
                  <p className="font-mono font-black text-lg text-primary">
                    ₹{totalHostelFee.toLocaleString('en-IN')}
                  </p>
                  <p className="text-[10px] text-muted-foreground">Fee Demand Generated</p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Action Buttons */}
        <div className="flex items-center justify-end gap-3 pt-2">
          <Button type="button" variant="outline" onClick={() => router.push('/students')} disabled={loading}>
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !selectedBedId || monthlyRent <= 0}
            className="gap-2 px-6 h-10 font-bold bg-[#E87545] hover:bg-[#D66434] text-white"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserCheck className="h-4 w-4" />}
            Confirm & Admit Student
          </Button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs font-bold text-slate-950">
        {label}
        {required && <span className="text-rose-600 font-black"> *</span>}
      </Label>
      {children}
    </div>
  );
}

export default function NewStudentPage() {
  return (
    <PageErrorBoundary fallbackTitle="Unable to load Student Registration">
      <NewStudentPageContent />
    </PageErrorBoundary>
  );
}


