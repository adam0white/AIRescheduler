/**
 * Dashboard Application
 * Main React application for AIRescheduler dashboard
 */

import { useState } from 'react';
import { TestingControls } from './components/TestingControls';
import { FlightStatusBoard } from './components/FlightStatusBoard';
import { HistoricalWeatherView } from './components/HistoricalWeatherView';

export function App() {
  const [activeView, setActiveView] = useState<'flights' | 'history'>('flights');

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
              }}
            >
              Weather History
            </button>
          </nav>
        </div>
      </header>

      <main>
        <TestingControls />
        {activeView === 'flights' ? <FlightStatusBoard /> : <HistoricalWeatherView />}
      </main>
    </div>
  );
}
