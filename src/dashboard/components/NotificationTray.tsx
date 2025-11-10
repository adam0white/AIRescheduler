/**
 * NotificationTray Component
 * Displays in-app notifications with badge, dropdown, and auto-refresh
 */

import { useState, useEffect, useRef } from 'react';
import { useRpc } from '../hooks/useRpc';

interface Notification {
  id: number;
  type: string;
  message: string;
  severity: 'low' | 'medium' | 'high';
  is_read: boolean;
  created_at: string;
  flight_id: number | null;
}

const colors = {
  blue: '#4A90E2',
  amber: '#F59E0B',
  red: '#EF4444',
  orange: '#FF9800',
  gray: '#6B7280',
  darkBg: '#1F2937',
  lightText: '#F3F4F6',
  divider: '#374151',
  badge: '#DC2626',
};

export function NotificationTray() {
  const { call } = useRpc();
  const [isOpen, setIsOpen] = useState(false);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [hoveredButtonId, setHoveredButtonId] = useState<number | null>(null);
  const trayRef = useRef<HTMLDivElement>(null);

  // Fetch notifications from RPC
  const fetchNotifications = async () => {
    setLoading(true);
    try {
      const { result } = await call('getRecentNotifications', { limit: 10 });
      setNotifications(result.notifications);
      setUnreadCount(result.totalCount);
    } catch (error) {
      console.error('Failed to fetch notifications:', error);
      setNotifications([]);
      setUnreadCount(0);
    } finally {
      setLoading(false);
    }
  };

  // Mark notification as read
  const handleMarkAsRead = async (notificationId: number, isRead: boolean) => {
    try {
      const newStatus = isRead ? 'unread' : 'read';
      await call('updateNotificationStatus', {
        notificationId,
        status: newStatus,
      });

      // Optimistic update
      setNotifications((prev) =>
        prev.map((n) =>
          n.id === notificationId ? { ...n, is_read: !isRead } : n
        )
      );

      // Update unread count
      setUnreadCount((prev) => (isRead ? prev + 1 : Math.max(0, prev - 1)));
    } catch (error) {
      console.error('Failed to update notification status:', error);
    }
  };

  // Get type color
  const getTypeColor = (type: string): string => {
    switch (type) {
      case 'auto-reschedule':
      case 'auto-rescheduled':
        return colors.blue;
      case 'advisory':
        return colors.amber;
      case 'cron-error':
      case 'error':
        return colors.red;
      case 'action-required':
        return colors.orange;
      case 'info':
      default:
        return colors.gray;
    }
  };

  // Get type label
  const getTypeLabel = (type: string): string => {
    switch (type) {
      case 'auto-reschedule':
      case 'auto-rescheduled':
        return 'Auto Reschedule';
      case 'advisory':
        return 'Advisory';
      case 'cron-error':
        return 'Cron Error';
      case 'action-required':
        return 'Action Required';
      case 'error':
        return 'Error';
      case 'info':
      default:
        return 'Info';
    }
  };

  // Format timestamp as relative time
  const formatTimestamp = (timestamp: string): string => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    const diffHours = Math.floor(diffMins / 60);
    if (diffHours < 24) return `${diffHours}h ago`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays}d ago`;
  };

  // Initial fetch
  useEffect(() => {
    fetchNotifications();
  }, []);

  // Auto-refresh every 30 seconds
  useEffect(() => {
    const interval = setInterval(() => {
      fetchNotifications();
    }, 30000);

    return () => clearInterval(interval);
  }, []);

  // Close tray on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (trayRef.current && !trayRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  return (
    <div ref={trayRef} style={{ position: 'relative' }}>
      {/* Bell icon with badge */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        style={{
          position: 'relative',
          padding: '0.5rem',
          backgroundColor: 'transparent',
          border: 'none',
          cursor: 'pointer',
          color: colors.lightText,
          fontSize: '1.5rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
        aria-label="Notifications"
      >
        {/* Bell icon */}
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"></path>
          <path d="M13.73 21a2 2 0 0 1-3.46 0"></path>
        </svg>

        {/* Unread count badge */}
        {unreadCount > 0 && (
          <span
            style={{
              position: 'absolute',
              top: '0.25rem',
              right: '0.25rem',
              backgroundColor: colors.badge,
              color: '#fff',
              borderRadius: '50%',
              width: '20px',
              height: '20px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.75rem',
              fontWeight: 'bold',
            }}
          >
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown tray */}
      {isOpen && (
        <div
          style={{
            position: 'absolute',
            top: '100%',
            right: 0,
            marginTop: '0.5rem',
            width: '450px',
            maxWidth: '90vw',
            maxHeight: '400px',
            backgroundColor: colors.darkBg,
            border: `1px solid ${colors.divider}`,
            borderRadius: '0.5rem',
            boxShadow: '0 10px 25px rgba(0, 0, 0, 0.5)',
            zIndex: 1000,
            overflow: 'hidden',
            display: 'flex',
            flexDirection: 'column',
            transition: 'opacity 0.2s ease',
          }}
        >
          {/* Header */}
          <div
            style={{
              padding: '1rem',
              borderBottom: `1px solid ${colors.divider}`,
              fontWeight: 'bold',
              fontSize: '1rem',
              color: colors.lightText,
            }}
          >
            Notifications
          </div>

          {/* Notifications list */}
          <div
            style={{
              overflowY: 'auto',
              flex: 1,
            }}
          >
            {loading && notifications.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: colors.gray,
                }}
              >
                Loading...
              </div>
            ) : notifications.length === 0 ? (
              <div
                style={{
                  padding: '2rem',
                  textAlign: 'center',
                  color: colors.gray,
                }}
              >
                <div style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>
                  No notifications
                </div>
                <div style={{ fontSize: '0.875rem' }}>You're all caught up!</div>
              </div>
            ) : (
              notifications.map((notification) => (
                <div
                  key={notification.id}
                  style={{
                    padding: '1rem',
                    borderBottom: `1px solid ${colors.divider}`,
                    opacity: notification.is_read ? 0.6 : 1,
                    backgroundColor: notification.is_read
                      ? 'transparent'
                      : 'rgba(59, 130, 246, 0.05)',
                    transition: 'opacity 0.2s ease',
                  }}
                >
                  {/* Type badge */}
                  <div
                    style={{
                      display: 'inline-block',
                      padding: '0.25rem 0.5rem',
                      borderRadius: '0.25rem',
                      backgroundColor: getTypeColor(notification.type),
                      color: '#fff',
                      fontSize: '0.75rem',
                      fontWeight: '600',
                      marginBottom: '0.5rem',
                    }}
                  >
                    {getTypeLabel(notification.type)}
                  </div>

                  {/* Message */}
                  <div
                    style={{
                      fontSize: '0.875rem',
                      color: colors.lightText,
                      marginBottom: '0.5rem',
                      lineHeight: '1.5',
                    }}
                  >
                    {notification.message}
                  </div>

                  {/* Footer - timestamp and action */}
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                    }}
                  >
                    <span
                      style={{
                        fontSize: '0.75rem',
                        color: colors.gray,
                      }}
                    >
                      {formatTimestamp(notification.created_at)}
                    </span>

                    <button
                      onClick={() =>
                        handleMarkAsRead(notification.id, notification.is_read)
                      }
                      style={{
                        padding: '0.25rem 0.5rem',
                        fontSize: '0.75rem',
                        backgroundColor: hoveredButtonId === notification.id ? colors.blue : 'transparent',
                        color: hoveredButtonId === notification.id ? '#fff' : colors.blue,
                        border: `1px solid ${colors.blue}`,
                        borderRadius: '0.25rem',
                        cursor: 'pointer',
                        transition: 'all 0.2s ease',
                      }}
                      onMouseEnter={() => setHoveredButtonId(notification.id)}
                      onMouseLeave={() => setHoveredButtonId(null)}
                    >
                      {notification.is_read ? 'Mark as unread' : 'Mark as read'}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
