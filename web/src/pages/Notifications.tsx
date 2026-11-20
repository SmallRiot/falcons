import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, ChevronRight } from 'lucide-react';
import { api, type Notification } from '../api';
import { fmt } from '../format';
import { startRoute } from '../nav';
import { Empty, Spinner, useApi, useMe } from '../ui';

export default function Notifications() {
  const { refresh } = useMe();
  const nav = useNavigate();
  const { data, loading } = useApi<Notification[]>('/api/notifications');
  useEffect(() => {
    if (data?.some((n) => !n.read)) void api.post('/api/notifications/read').then(refresh);
  }, [data, refresh]);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Уведомления</h1>
          <div className="sub">То же, что бот пишет в личку</div>
        </div>
      </div>
      {loading ? (
        <Spinner />
      ) : !data?.length ? (
        <Empty icon={<Bell size={26} />} title="Пока тихо" />
      ) : (
        <div className="list">
          {data.map((n) => {
            const to = n.link ? startRoute(n.link) : null;
            return (
              <button key={n.id} className="row" style={{ alignItems: 'flex-start' }} onClick={() => to && nav(to)}>
                <span
                  style={{ width: 8, height: 8, borderRadius: 4, marginTop: 7, flex: 'none', background: n.read ? 'transparent' : 'var(--falcon)' }}
                />
                <div className="grow">
                  <div style={{ fontSize: 14, whiteSpace: 'pre-line' }}>{n.text}</div>
                  <div className="meta" style={{ marginTop: 3 }}>
                    {fmt.dateShort(n.created_at)}, {fmt.time(n.created_at)}
                  </div>
                </div>
                {to && <ChevronRight size={18} className="chev" style={{ marginTop: 2 }} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
