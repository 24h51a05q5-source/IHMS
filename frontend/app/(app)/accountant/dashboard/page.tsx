'use client';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
export default function AliasPage() {
  const router = useRouter();
  useEffect(() => { router.replace('/fees'); }, [router]);
  return null;
}
