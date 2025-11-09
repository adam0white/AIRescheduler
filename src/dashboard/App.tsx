/**
 * Dashboard Application
 * Main React application for AIRescheduler dashboard
 */

import { TestingControls } from './components/TestingControls';

export function App() {
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
      </header>

      <main>
        <TestingControls />
      </main>
    </div>
  );
}
