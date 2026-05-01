/* Tether — Help tab component. */

const { Button, Card } = window.TetherComponents;
const { useApp } = window.TetherContext;

function HelpTab() {
  const { setState } = useApp();

  return (
    <div className="p-8 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="font-serif text-3xl text-warm-900">Help</h1>
        <p className="text-warm-600 mt-1">Shortcuts and controls.</p>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={() => setState((s) => ({ ...s, phase: 'walkthrough' }))}>Restart onboarding</Button>
        <Button variant="ghost">
          <a href="https://github.com/DabeerAzeez/tether-crm" target="_blank" rel="noreferrer">GitHub repo ↗</a>
        </Button>
      </div>

      <Card className="p-6">
        <h3 className="font-serif text-lg mb-3">Keyboard shortcuts</h3>
        <div className="grid grid-cols-2 gap-y-2 text-sm text-warm-700">
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G R</kbd>Go to Reconnect</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G A</kbd>Go to Ask</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G M</kbd>Go to Map</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">G C</kbd>Go to Calendar</div>
          <div><kbd className="px-2 py-0.5 bg-warm-100 rounded text-xs mr-2">/</kbd>Search in All Contacts</div>
        </div>
      </Card>
    </div>
  );
}

window.TetherTabs = window.TetherTabs || {};
window.TetherTabs.HelpTab = HelpTab;
