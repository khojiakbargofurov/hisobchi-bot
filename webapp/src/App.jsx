import { useState, useEffect } from 'react';
import {
  TrendingUp,
  TrendingDown,
  ArrowUpRight,
  ArrowDownLeft,
  LayoutDashboard,
  Clock
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid,
  PieChart, Pie, Cell, Legend
} from 'recharts';

const COLORS = ['#ef4444', '#f59e0b', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899', '#06b6d4', '#84cc16', '#cf1124'];

function App() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState('overview');
  const [showClearModal, setShowClearModal] = useState(false);

  useEffect(() => {
    const tg = window.Telegram?.WebApp;
    if (tg) {
      tg.expand();
      try {
        tg.setHeaderColor('#0B1120');
        tg.setBackgroundColor('#0B1120');
      } catch (e) { }
    }

    // Get user ID (mock for development if not in Telegram)
    const chatId = tg?.initDataUnsafe?.user?.id || 8158002704;

    const fetchStats = async () => {
      try {
        const baseUrl = import.meta.env.VITE_API_URL || (
          window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
            ? 'http://localhost:3000'
            : ''
        );

        const response = await fetch(`${baseUrl}/api/stats?chatId=${chatId}`);
        if (!response.ok) throw new Error("Server xatosi");

        const result = await response.json();
        // reverse weeklyData so oldest is first for the chart left-to-right
        if (result.weeklyData) result.weeklyData.reverse();
        setData(result);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchStats();
  }, []);

  const formatMoney = (amount) => {
    if (amount >= 1000000) return (amount / 1000000).toFixed(1) + 'M';
    if (amount >= 1000) return (amount / 1000).toFixed(1) + 'K';
    return amount.toString();
  };

  const formatMoneyFull = (amount) => new Intl.NumberFormat('uz-UZ').format(amount || 0);

  const formatDate = (dateString) => {
    return new Date(dateString).toLocaleDateString('uz-UZ', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  };

  if (loading) return <div className="loader-container"><div className="spinner"></div></div>;
  if (error) return <div className="container" style={{ textAlign: 'center', marginTop: '50px' }}><h3>Xatolik yuz berdi</h3><p>{error}</p></div>;

  const { balance, monthlyStats, recentTransactions, weeklyData, expensesByCategory, incomesByCategory } = data;

  const renderOverview = () => (
    <div className="container">
      <div className="hero-card">
        <div className="hero-label">Joriy Balans</div>
        <div>
          <span className="hero-amount">{formatMoneyFull(balance)}</span>
          <span className="hero-currency">UZS</span>
        </div>
      </div>

      <div className="quick-stats">
        <div className="quick-stat">
          <div className="stat-header"><TrendingUp size={18} /> Oylik Kirim</div>
          <div className="stat-val text-income">+{formatMoney(monthlyStats?.income)}</div>
        </div>
        <div className="quick-stat">
          <div className="stat-header"><TrendingDown size={18} /> Oylik Chiqim</div>
          <div className="stat-val text-expense">-{formatMoney(monthlyStats?.expense)}</div>
        </div>
      </div>

      <div className="card">
        <div className="section-title" style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>
          Haftalik Dinamika
        </div>
        <div className="chart-container">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={weeklyData} margin={{ top: 10, right: 0, left: -20, bottom: 0 }}>
              <defs>
                <linearGradient id="colorIncome" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="colorExpense" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#ef4444" stopOpacity={0.3} />
                  <stop offset="95%" stopColor="#ef4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(255,255,255,0.05)" />
              <XAxis dataKey="name" tick={{ fontSize: 10, fill: '#8B9BB4' }} tickLine={false} axisLine={false} />
              <YAxis tickFormatter={(val) => formatMoney(val)} tick={{ fontSize: 10, fill: '#8B9BB4' }} tickLine={false} axisLine={false} />
              <Tooltip
                formatter={(value) => formatMoneyFull(value) + ' UZS'}
                labelStyle={{ color: '#8B9BB4', paddingBottom: '4px' }}
                itemStyle={{ fontWeight: '600', color: '#fff' }}
                contentStyle={{
                  backgroundColor: '#151F32',
                  borderRadius: '16px',
                  border: '1px solid rgba(255,255,255,0.05)',
                  boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                  padding: '12px'
                }}
              />
              <Area type="monotone" dataKey="income" stroke="#10b981" strokeWidth={3} fillOpacity={1} fill="url(#colorIncome)" />
              <Area type="monotone" dataKey="expense" stroke="#ef4444" strokeWidth={3} fillOpacity={1} fill="url(#colorExpense)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {incomesByCategory && incomesByCategory.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>
            Daromad Turlari (Bu oy)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {incomesByCategory.map((item, idx) => {
              const maxVal = incomesByCategory[0].value;
              const percent = Math.round((item.value / maxVal) * 100);
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.category}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>+{formatMoneyFull(item.value)} UZS</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: 'var(--accent-green)', borderRadius: '4px' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {expensesByCategory && expensesByCategory.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>
            Xarajatlar Tahlili (Grafik)
          </div>
          <div className="chart-container" style={{ height: '260px' }}>
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={expensesByCategory}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={90}
                  paddingAngle={5}
                  dataKey="value"
                  nameKey="category"
                  stroke="none"
                >
                  {expensesByCategory.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                  ))}
                </Pie>
                <Tooltip
                  formatter={(value) => formatMoneyFull(value) + ' UZS'}
                  itemStyle={{ fontWeight: '600', color: '#fff' }}
                  contentStyle={{
                    backgroundColor: '#151F32',
                    borderRadius: '16px',
                    boxShadow: '0 8px 24px rgba(0,0,0,0.3)',
                    padding: '12px',
                    border: 'none'
                  }}
                />
                <Legend
                  verticalAlign="bottom"
                  height={36}
                  iconType="circle"
                  wrapperStyle={{ fontSize: '12px', color: '#8B9BB4' }}
                />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {expensesByCategory && expensesByCategory.length > 0 && (
        <div className="card">
          <div className="section-title" style={{ margin: '0 0 16px 0', fontSize: '1rem' }}>
            Xarajat Turlari (Bu oy)
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
            {expensesByCategory.map((item, idx) => {
              const maxVal = expensesByCategory[0].value;
              const percent = Math.round((item.value / maxVal) * 100);
              return (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-main)' }}>{item.category}</span>
                    <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>-{formatMoneyFull(item.value)} UZS</span>
                  </div>
                  <div style={{ height: '6px', background: 'rgba(255,255,255,0.05)', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '100%', width: `${percent}%`, background: 'var(--accent-red)', borderRadius: '4px' }}></div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );

  const handleDeleteAll = () => {
    setShowClearModal(true);
  };

  const confirmDeleteAll = async () => {

    try {
      const tg = window.Telegram?.WebApp;
      const chatId = tg?.initDataUnsafe?.user?.id || 8158002704;
      const baseUrl = import.meta.env.VITE_API_URL || (
        window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1'
          ? 'http://localhost:3000'
          : ''
      );

      const response = await fetch(`${baseUrl}/api/transactions?chatId=${chatId}`, {
        method: 'DELETE'
      });

      if (!response.ok) throw new Error("O'chirishda xatolik");

      // Reload on success to fetch fresh empty state
      window.location.reload();
    } catch (err) {
      alert(err.message);
    } finally {
      setShowClearModal(false);
    }
  };

  const renderHistory = () => (
    <div className="container">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', margin: '0 0 20px 0' }}>
        <div className="section-title" style={{ margin: 0 }}>Barcha Amaliyotlar</div>
        <button
          onClick={handleDeleteAll}
          style={{
            background: 'var(--accent-red)', color: '#fff', border: 'none',
            padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem',
            fontWeight: '600', cursor: 'pointer'
          }}
        >
          Tozalash
        </button>
      </div>
      <div className="tx-list">
        {recentTransactions?.length === 0 ? (
          <div style={{ textAlign: 'center', padding: '30px', color: '#8B9BB4' }}>
            Hozircha ma'lumot yo'q
          </div>
        ) : (
          recentTransactions.map((tx, idx) => (
            <div key={idx} className="tx-item">
              <div className="tx-left">
                <div className={`tx-icon ${tx.type === 'income' ? 'bg-income' : 'bg-expense'}`}>
                  {tx.type === 'income' ? <ArrowDownLeft size={20} /> : <ArrowUpRight size={20} />}
                </div>
                <div className="tx-info">
                  <div className="tx-desc">{tx.description}</div>
                  <div className="tx-date">{formatDate(tx.date)} &bull; {tx.category || (tx.type === 'income' ? 'Daromad' : 'Boshqa')}</div>
                </div>
              </div>
              <div className={`tx-amount ${tx.type === 'income' ? 'text-income' : 'text-expense'}`}>
                {tx.type === 'income' ? '+' : '-'}{formatMoneyFull(tx.amount)}
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );

  return (
    <>
      {activeTab === 'overview' ? renderOverview() : renderHistory()}

      {/* Bottom Navigation */}
      <div className="bottom-nav">
        <button
          className={`nav-item ${activeTab === 'overview' ? 'active' : ''}`}
          onClick={() => setActiveTab('overview')}
        >
          <LayoutDashboard size={24} />
          <span>Asosiy</span>
        </button>
        <button
          className={`nav-item ${activeTab === 'history' ? 'active' : ''}`}
          onClick={() => setActiveTab('history')}
        >
          <Clock size={24} />
          <span>Tarix</span>
        </button>
      </div>

      {showClearModal && (
        <div className="modal-overlay" style={{
          position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
          backgroundColor: 'rgba(11, 17, 32, 0.8)', backdropFilter: 'blur(5px)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000
        }}>
          <div className="modal-content" style={{
            background: 'var(--bg-card)', padding: '24px', borderRadius: 'var(--app-radius-lg)',
            width: '85%', maxWidth: '340px', boxShadow: 'var(--shadow-card)', border: '1px solid rgba(255,255,255,0.05)'
          }}>
            <h3 style={{ margin: '0 0 12px 0', fontSize: '1.2rem', color: 'var(--text-main)' }}>Diqqat!</h3>
            <p style={{ margin: '0 0 24px 0', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5 }}>
              Barcha ma'lumotlaringiz butunlay o'chirib yuboriladi. Bu amalni qaytarib bo'lmaydi. Ishonchingiz komilmi?
            </p>
            <div style={{ display: 'flex', gap: '12px' }}>
              <button
                onClick={() => setShowClearModal(false)}
                style={{
                  flex: 1, padding: '12px', background: 'rgba(255,255,255,0.05)', color: 'var(--text-main)',
                  border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                Bekor qilish
              </button>
              <button
                onClick={confirmDeleteAll}
                style={{
                  flex: 1, padding: '12px', background: 'var(--accent-red)', color: '#fff',
                  border: 'none', borderRadius: '12px', fontWeight: '600', cursor: 'pointer'
                }}
              >
                O'chirish
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default App;
