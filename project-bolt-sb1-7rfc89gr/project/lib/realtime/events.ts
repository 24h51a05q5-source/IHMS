// Central registry of real-time event names.
// The NestJS backend MUST emit these exact event names.
export const SOCKET_EVENTS = {
  PAYMENT_CREATED: 'payment.created',
  PAYMENT_SUCCESS: 'payment.success',
  FEE_UPDATED: 'fee.updated',
  BED_UPDATED: 'bed.updated',
  STUDENT_UPDATED: 'student.updated',
  COMPLAINT_CREATED: 'complaint.created',
  COMPLAINT_UPDATED: 'complaint.updated',
  LEAVE_UPDATED: 'leave.updated',
  VISITOR_UPDATED: 'visitor.updated',
  NOTIFICATION_CREATED: 'notification.created',
  MESS_MENU_UPDATED: 'messMenu.updated',
} as const;

export type SocketEventName = (typeof SOCKET_EVENTS)[keyof typeof SOCKET_EVENTS];
