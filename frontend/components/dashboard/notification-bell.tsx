'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Bell, Check, CheckCheck, ExternalLink, Info, AlertTriangle, CheckCircle2, AlertCircle } from 'lucide-react';
import { notificationsApi } from '@/lib/api/notifications.api';
import { useRealtimeEvent } from '@/lib/realtime/use-realtime';
import { useAuth } from '@/lib/auth/auth-context';
import type { Notification } from '@/lib/types';
import { cn } from '@/lib/utils';

export function NotificationBell({
  className,
  onOpenChange,
}: {
  className?: string;
  onOpenChange?: (open: boolean) => void;
}) {
  const { user } = useAuth();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [recentNotifications, setRecentNotifications] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const isStudent = user?.role === 'STUDENT';
  const allNotificationsHref = isStudent ? '/student/notifications' : '/notifications';

  // Fetch unread count
  const refreshUnreadCount = useCallback(async () => {
    try {
      const res = await notificationsApi.unreadCount();
      setUnreadCount(res?.count || 0);
    } catch {
      /* ignore */
    }
  }, []);

  // Fetch recent notifications for dropdown
  const loadRecentNotifications = useCallback(async () => {
    setLoading(true);
    try {
      const res = await notificationsApi.list({ pageSize: 6 });
      setRecentNotifications(res?.items || []);
    } catch {
      /* ignore */
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refreshUnreadCount();
  }, [refreshUnreadCount]);

  // Real-time listener
  useRealtimeEvent('notification.created', () => {
    refreshUnreadCount();
    if (open) {
      loadRecentNotifications();
    }
  });

  // Handle dropdown toggle
  const toggleDropdown = () => {
    const nextState = !open;
    setOpen(nextState);
    onOpenChange?.(nextState);
    if (nextState) {
      loadRecentNotifications();
    }
  };

  // Click away listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    }
    if (open) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [open, onOpenChange]);

  // Mark single notification as read
  const handleMarkOne = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await notificationsApi.markRead(id);
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, read: true, isRead: true } : n))
      );
      setUnreadCount((c) => Math.max(0, c - 1));
    } catch {
      /* ignore */
    }
  };

  // Mark all as read
  const handleMarkAll = async () => {
    try {
      await notificationsApi.markAllRead();
      setRecentNotifications((prev) =>
        prev.map((n) => ({ ...n, read: true, isRead: true }))
      );
      setUnreadCount(0);
    } catch {
      /* ignore */
    }
  };

  // Item click: mark as read and navigate if link present
  const handleNotificationClick = async (notif: Notification) => {
    if (!notif.read && !notif.isRead) {
      await notificationsApi.markRead(notif.id).catch(() => {});
      setUnreadCount((c) => Math.max(0, c - 1));
      setRecentNotifications((prev) =>
        prev.map((n) => (n.id === notif.id ? { ...n, read: true, isRead: true } : n))
      );
    }
    setOpen(false);
    onOpenChange?.(false);
    if (notif.actionUrl) {
      router.push(notif.actionUrl);
    } else {
      router.push(allNotificationsHref);
    }
  };

  const getTypeIcon = (type?: string) => {
    switch (type) {
      case 'SUCCESS':
        return <CheckCircle2 className="h-4 w-4 text-[#16A34A] shrink-0" />;
      case 'WARNING':
        return <AlertTriangle className="h-4 w-4 text-[#D97706] shrink-0" />;
      case 'ERROR':
        return <AlertCircle className="h-4 w-4 text-[#DC2626] shrink-0" />;
      default:
        return <Info className="h-4 w-4 text-[#2563EB] shrink-0" />;
    }
  };

  const formatRelativeTime = (dateStr?: string | Date) => {
    if (!dateStr) return '';
    const date = new Date(dateStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - date.getTime()) / 1000);

    if (diffSec < 60) return 'Just now';
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    if (diffSec < 604800) return `${Math.floor(diffSec / 86400)}d ago`;
    return date.toLocaleDateString();
  };

  return (
    <div className={cn('relative inline-block', className)} ref={dropdownRef}>
      {/* Bell Trigger Button */}
      <button
        type="button"
        onClick={toggleDropdown}
        aria-label="View notifications"
        aria-expanded={open}
        className={cn(
          'relative flex h-9 w-9 items-center justify-center rounded-lg border border-[#CBD5E1] bg-white text-[#111827] transition-colors',
          'hover:bg-[#F8FAFC] hover:border-[#E87545]',
          open && 'bg-[#F8FAFC] border-[#E87545]'
        )}
      >
        <Bell className="h-4 w-4 text-[#475569]" />
        {unreadCount > 0 && (
          <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-[20px] items-center justify-center rounded-full bg-[#E87545] px-1 text-[10px] font-extrabold text-white shadow-sm ring-2 ring-white">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* Popover Dropdown Panel */}
      {open && (
        <div
          className={cn(
            'absolute right-0 mt-2 w-80 sm:w-96 rounded-xl border border-[#DDD8CC] bg-white shadow-xl z-50 overflow-hidden',
            'animate-in fade-in-0 zoom-in-95 duration-100'
          )}
        >
          {/* Header */}
          <div className="flex items-center justify-between border-b border-[#ECE9E1] px-4 py-3 bg-[#F8FAFC]">
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[#111827]">Notifications</span>
              {unreadCount > 0 && (
                <span className="rounded-full bg-[#E87545]/10 px-2 py-0.5 text-[11px] font-bold text-[#E87545]">
                  {unreadCount} new
                </span>
              )}
            </div>
            {unreadCount > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-[11px] font-semibold text-[#64748B] hover:text-[#111827] flex items-center gap-1 transition-colors"
              >
                <CheckCheck className="h-3.5 w-3.5" />
                Mark all read
              </button>
            )}
          </div>

          {/* Notification List */}
          <div className="max-h-[380px] overflow-y-auto divide-y divide-[#ECE9E1]">
            {loading && recentNotifications.length === 0 ? (
              <div className="py-8 text-center text-xs text-[#94A3B8]">
                Loading notifications...
              </div>
            ) : recentNotifications.length === 0 ? (
              <div className="py-8 text-center px-4">
                <Bell className="h-8 w-8 mx-auto text-[#CBD5E1] mb-2" />
                <p className="text-xs font-semibold text-[#64748B]">No notifications yet</p>
                <p className="text-[11px] text-[#94A3B8] mt-0.5">
                  You are all caught up!
                </p>
              </div>
            ) : (
              recentNotifications.map((notif) => {
                const isUnread = !notif.read && !notif.isRead;
                return (
                  <div
                    key={notif.id}
                    onClick={() => handleNotificationClick(notif)}
                    className={cn(
                      'group relative flex items-start gap-3 p-3.5 cursor-pointer transition-colors',
                      isUnread
                        ? 'bg-[#FEF7F4] hover:bg-[#FEEFEA] border-l-4 border-l-[#E87545]'
                        : 'bg-white hover:bg-[#F8FAFC]'
                    )}
                  >
                    <div className="mt-0.5">{getTypeIcon(notif.type)}</div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-1">
                        <p
                          className={cn(
                            'text-xs truncate',
                            isUnread ? 'font-bold text-[#111827]' : 'font-semibold text-[#475569]'
                          )}
                        >
                          {notif.title}
                        </p>
                        <span className="text-[10px] text-[#94A3B8] shrink-0 font-medium">
                          {formatRelativeTime(notif.createdAt)}
                        </span>
                      </div>
                      <p className="text-[11.5px] text-[#64748B] line-clamp-2 mt-0.5 leading-relaxed">
                        {notif.message}
                      </p>
                    </div>

                    {/* Mark as read icon button for unread items */}
                    {isUnread && (
                      <button
                        type="button"
                        onClick={(e) => handleMarkOne(e, notif.id)}
                        title="Mark as read"
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-[#E87545]/20 rounded text-[#E87545] transition-all shrink-0 mt-0.5"
                      >
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>

          {/* Footer View All Link */}
          <div className="border-t border-[#ECE9E1] p-2.5 bg-[#F8FAFC] text-center">
            <Link
              href={allNotificationsHref}
              onClick={() => {
                setOpen(false);
                onOpenChange?.(false);
              }}
              className="text-xs font-bold text-[#E87545] hover:text-[#D16032] inline-flex items-center gap-1 transition-colors"
            >
              View all notifications
              <ExternalLink className="h-3 w-3" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
