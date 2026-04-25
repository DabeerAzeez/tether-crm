/* Tether — App entry point.
   Assembles the app from modular files loaded via window globals. */

const { useEffect } = React;

const { AppProvider, useApp } = window.TetherContext;
const { DrawerProvider } = window.TetherDrawer;
const { Sidebar } = window.TetherSidebar;
const { SignInScreen, SyncProgress, LabelMappingScreen, CloseFriendPicker, WalkthroughOverlay, SkippedWalkthroughToast } = window.TetherOnboarding;
const { ReconnectTab, AllContactsTab, CalendarTab, MapTab, AskTab, HelpTab, SettingsTab } = window.TetherTabs;

// ───────────────────────────────────────────────────────────────────
// DASHBOARD
// ───────────────────────────────────────────────────────────────────

function Dashboard() {
  const { state } = useApp();

  const tabs = {
    reconnect: <ReconnectTab />,
    ask: <AskTab />,
    map: <MapTab />,
    calendar: <CalendarTab />,
    contacts: <AllContactsTab />,
    trash: <AllContactsTab />,
    help: <HelpTab />,
    settings: <SettingsTab />,
  };

  return (
    <div className="h-screen flex bg-warm-50">
      <Sidebar />
      <main className="flex-1 overflow-y-auto relative z-0">
        {tabs[state.activeTab] || <ReconnectTab />}
      </main>
    </div>
  );
}

// ───────────────────────────────────────────────────────────────────
// ROOT
// ───────────────────────────────────────────────────────────────────

function Root() {
  const { state } = useApp();

  // Keyboard shortcuts
  useEffect(() => {
    let pending = null;
    const handler = (e) => {
      if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.isContentEditable) return;
      if (e.key === 'g') { pending = 'g'; setTimeout(() => { pending = null; }, 700); return; }
      if (pending === 'g') {
        const map = { r: 'reconnect', a: 'ask', m: 'map', c: 'calendar' };
        if (map[e.key]) {
          document.dispatchEvent(new CustomEvent('tether-tab', { detail: map[e.key] }));
        }
        pending = null;
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  if (state.phase === 'signin') return <SignInScreen />;
  if (state.phase === 'syncing') return <SyncProgress />;
  if (state.phase === 'setup-mapping') return <LabelMappingScreen />;
  if (state.phase === 'setup-closefriends') return <CloseFriendPicker />;
  if (state.phase === 'walkthrough') return <><Dashboard /><WalkthroughOverlay /></>;
  return <><Dashboard /><SkippedWalkthroughToast /></>;
}

function KeyListener() {
  const { setState } = useApp();
  useEffect(() => {
    const h = (e) => setState((s) => ({ ...s, activeTab: e.detail }));
    document.addEventListener('tether-tab', h);
    return () => document.removeEventListener('tether-tab', h);
  }, [setState]);
  return null;
}

function App() {
  return (
    <AppProvider>
      <DrawerProvider>
        <KeyListener />
        <Root />
      </DrawerProvider>
    </AppProvider>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<App />);
