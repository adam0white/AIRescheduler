/**
 * Dashboard Application
 * Main React application for AIRescheduler dashboard
 */

import { useState } from 'react';
import { TestingControls } from './components/TestingControls';
import { FlightStatusBoard } from './components/FlightStatusBoard';
import { HistoricalWeatherView } from './components/HistoricalWeatherView';
import { CronStatusMonitor } from './components/CronStatusMonitor';
import { NotificationTray } from './components/NotificationTray';

export function App() {
  const [activeView, setActiveView] = useState<'flights' | 'history' | 'cron'>('flights');
  const [showDeveloperPanel, setShowDeveloperPanel] = useState(false);

  const renderActiveView = () => {
    switch (activeView) {
      case 'history':
        return <HistoricalWeatherView />;
      case 'cron':
        return <CronStatusMonitor />;
      case 'flights':
      default:
        return <FlightStatusBoard />;
    }
  };

  return (
    <div
      style={{
        minHeight: '100vh',
        backgroundColor: '#0f172a',
        color: '#e5e7eb',
      }}
    >
      <header
        style={{
          backgroundColor: '#1e293b',
          borderBottom: '1px solid #334155',
          padding: '1rem 2rem',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <h1
            style={{
              fontSize: '1.875rem',
              fontWeight: 'bold',
              margin: 0,
              background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              backgroundClip: 'text',
            }}
          >
            AIRescheduler Dashboard
          </h1>

          <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
            <nav style={{ display: 'flex', gap: '0.5rem' }}>
              <button
                onClick={() => setActiveView('flights')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: activeView === 'flights' ? '#3b82f6' : '#374151',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'background-color 0.2s ease',
                }}
              >
                Flight Status
              </button>
              <button
                onClick={() => setActiveView('history')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: activeView === 'history' ? '#3b82f6' : '#374151',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'background-color 0.2s ease',
                }}
              >
                Weather History
              </button>
              <button
                onClick={() => setActiveView('cron')}
                style={{
                  padding: '0.5rem 1rem',
                  borderRadius: '0.375rem',
                  backgroundColor: activeView === 'cron' ? '#3b82f6' : '#374151',
                  color: '#ffffff',
                  border: 'none',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                  fontWeight: 500,
                  transition: 'background-color 0.2s ease',
                }}
              >
                Cron Status
              </button>
            </nav>

            <button
              onClick={() => setShowDeveloperPanel((prev) => !prev)}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '9999px',
                backgroundColor: showDeveloperPanel ? 'rgba(59, 130, 246, 0.15)' : 'transparent',
                color: '#cbd5f5',
                border: '1px solid rgba(148, 163, 184, 0.4)',
                cursor: 'pointer',
                fontSize: '0.75rem',
                fontWeight: 600,
                letterSpacing: '0.02em',
                transition: 'all 0.2s ease',
              }}
            >
              {showDeveloperPanel ? 'Hide Dev Controls' : 'Show Dev Controls'}
            </button>

            <NotificationTray />
          </div>
        </div>
      </header>

      <main
        style={{
          padding: '2rem',
        }}
      >
        <div
          style={{
            maxWidth: '1400px',
            margin: '0 auto',
            display: 'grid',
            gap: '2rem',
          }}
        >
          {activeView === 'flights' && showDeveloperPanel && (
            <div
              style={{
                border: '1px solid rgba(148, 163, 184, 0.25)',
                borderRadius: '0.75rem',
                backgroundColor: 'rgba(15, 23, 42, 0.75)',
                backdropFilter: 'blur(10px)',
                boxShadow: '0 20px 45px -20px rgba(15, 23, 42, 0.8)',
              }}
            >
              <TestingControls layout="overlay" onClose={() => setShowDeveloperPanel(false)} />
            </div>
          )}

          <section
            style={{
              borderRadius: activeView === 'history' ? '0.75rem' : '0',
              backgroundColor: activeView === 'history' ? '#f9fafb' : 'transparent',
              border: activeView === 'history' ? '1px solid rgba(226, 232, 240, 0.75)' : 'none',
              boxShadow: activeView === 'history' ? '0 15px 35px -15px rgba(15, 23, 42, 0.15)' : 'none',
              padding: activeView === 'history' ? '2rem' : '0',
            }}
          >
            {renderActiveView()}
          </section>
        </div>
      </main>
    </div>
  );
}
