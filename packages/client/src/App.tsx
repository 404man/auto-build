import { useState, useCallback, useEffect } from 'react';
import { ConfigProvider } from 'antd';
import zhCN from 'antd/locale/zh_CN';
import BuildCenterTab from './components/BuildCenterTab';
import SettingsPage from './components/SettingsPage';
import { appTheme } from './theme';

interface TabInfo {
  id: string;
  name: string;
}

function loadTabs(): TabInfo[] {
  try {
    const cached = localStorage.getItem('auto-build:tabs');
    if (cached) {
      const parsed = JSON.parse(cached) as TabInfo[];
      if (Array.isArray(parsed) && parsed.length > 0) return parsed;
    }
  } catch { /* ignore */ }
  return [{ id: 'default', name: 'Project 1' }];
}

function App() {
  const [activePage, setActivePage] = useState<'build' | 'settings'>('build');
  const [tabs, setTabs] = useState<TabInfo[]>(loadTabs);
  const [activeTabId, setActiveTabId] = useState<string>(() => {
    const loaded = loadTabs();
    return loaded[0]?.id || 'default';
  });

  // Persist tabs list
  useEffect(() => {
    try {
      localStorage.setItem('auto-build:tabs', JSON.stringify(tabs));
    } catch { /* ignore */ }
  }, [tabs]);

  const handleNewProject = useCallback(() => {
    setActivePage('build');
    const newTab: TabInfo = {
      id: Date.now().toString(),
      name: `Project ${tabs.length + 1}`,
    };
    setTabs((prev) => [...prev, newTab]);
    setActiveTabId(newTab.id);
  }, [tabs.length]);

  const handleCloseTab = useCallback((tabId: string) => {
    setTabs((prev) => {
      const next = prev.filter((t) => t.id !== tabId);
      if (next.length === 0) {
        const fallback: TabInfo = { id: Date.now().toString(), name: 'Project 1' };
        // Clean up old tab storage
        localStorage.removeItem(`auto-build:tab:${tabId}:projects`);
        localStorage.removeItem(`auto-build:tab:${tabId}:branches`);
        setActiveTabId(fallback.id);
        return [fallback];
      }
      // Clean up closed tab storage
      localStorage.removeItem(`auto-build:tab:${tabId}:projects`);
      localStorage.removeItem(`auto-build:tab:${tabId}:branches`);
      return next;
    });
    setActiveTabId((currentActive) => {
      if (currentActive === tabId) {
        // Will be updated by the setTabs callback if fallback needed,
        // otherwise pick the first remaining tab
        const remaining = tabs.filter((t) => t.id !== tabId);
        return remaining[0]?.id || '';
      }
      return currentActive;
    });
  }, [tabs]);

  const handleTabNameChange = useCallback((tabId: string, name: string) => {
    setTabs((prev) => prev.map((t) => (t.id === tabId ? { ...t, name } : t)));
  }, []);

  return (
    <ConfigProvider locale={zhCN} theme={appTheme}>
      <div className="bg-background text-on-surface antialiased overflow-hidden flex h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>

        {/* ── SideNavBar (240px fixed) ── */}
        <nav className="bg-surface-container-low fixed left-0 top-0 h-screen w-[240px] border-r border-outline-variant flex flex-col p-md gap-sm z-50">
          {/* Brand */}
          <div className="flex items-center gap-sm mb-lg px-sm pt-sm">
            <span className="material-symbols-outlined text-primary text-3xl">build_circle</span>
            <div>
              <h1 className="text-[24px] font-bold text-primary tracking-tight leading-tight">BuildEngine</h1>
              <p className="text-[12px] text-on-surface-variant" style={{ fontFamily: 'JetBrains Mono, monospace' }}>Local v1.0.4</p>
            </div>
          </div>

          {/* New Project Button */}
          <button
            onClick={handleNewProject}
            className="bg-primary-container text-on-primary-container hover:bg-inverse-primary hover:text-white transition-colors duration-150 py-sm px-md rounded text-[14px] font-semibold flex items-center justify-center gap-xs w-full mb-md active:scale-95"
          >
            <span className="material-symbols-outlined text-lg">add</span>
            New Project
          </button>

          {/* Nav Items */}
          <div className="flex flex-col gap-xs flex-1">
            <a
              className={`rounded-lg flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest active:scale-95 duration-150 cursor-pointer ${
                activePage === 'build'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={(e) => { e.preventDefault(); setActivePage('build'); }}
            >
              <span className="material-symbols-outlined">rocket_launch</span>
              Build Center
            </a>
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150 cursor-not-allowed opacity-60">
              <span className="material-symbols-outlined">folder_open</span>
              Projects
            </a>
            <a
              className={`rounded-lg flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest active:scale-95 duration-150 cursor-pointer ${
                activePage === 'settings'
                  ? 'bg-secondary-container text-on-secondary-container'
                  : 'text-on-surface-variant hover:text-on-surface'
              }`}
              onClick={(e) => { e.preventDefault(); setActivePage('settings'); }}
            >
              <span className="material-symbols-outlined">settings</span>
              Settings
            </a>
          </div>

          {/* Bottom Nav */}
          <div className="mt-auto flex flex-col gap-xs pt-md border-t border-outline-variant">
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150" href="#">
              <span className="material-symbols-outlined">description</span>
              Docs
            </a>
            <a className="text-on-surface-variant hover:text-on-surface flex items-center gap-sm px-md py-sm text-[14px] font-medium transition-colors hover:bg-surface-container-highest rounded-lg active:scale-95 duration-150" href="#">
              <span className="material-symbols-outlined">help</span>
              Support
            </a>
          </div>
        </nav>

        {/* ── TopAppBar (fixed) ── */}
        <header className="bg-background fixed top-0 right-0 w-[calc(100%-240px)] h-16 border-b border-outline-variant flex items-center justify-between px-lg ml-[240px] z-40">
          <div className="flex items-center gap-lg h-full">
            <nav className="flex items-center h-full gap-md">
              <a className="text-primary border-b-2 border-primary pb-xs h-full flex items-center text-[16px] font-medium cursor-pointer" href="#">Dashboard</a>
              <a className="text-on-surface-variant h-full flex items-center text-[16px] font-medium cursor-pointer hover:text-primary" href="#">Logs</a>
              <a className="text-on-surface-variant h-full flex items-center text-[16px] font-medium cursor-pointer hover:text-primary" href="#">Artifacts</a>
            </nav>
          </div>
          <div className="flex items-center gap-md">
            <div className="relative flex items-center">
              <input
                className="bg-surface-container-low border border-outline-variant rounded-full py-xs pl-md pr-10 text-on-surface focus:outline-none focus:border-primary w-64 text-[14px] placeholder:text-on-surface-variant"
                placeholder="Search..."
                type="text"
              />
              <span className="material-symbols-outlined absolute right-3 text-on-surface-variant pointer-events-none">search</span>
            </div>
            <button className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded-full hover:bg-surface-container-highest">
              <span className="material-symbols-outlined">notifications</span>
            </button>
            <button className="text-on-surface-variant hover:text-primary transition-colors p-xs rounded-full hover:bg-surface-container-highest">
              <span className="material-symbols-outlined">terminal</span>
            </button>
          </div>
        </header>

        {/* ── Main Content ── */}
        <main className="ml-[240px] mt-16 flex-1 overflow-y-auto w-[calc(100%-240px)] flex flex-col">
          {activePage === 'build' && (
            <div className="flex flex-col flex-1">
              {/* Tab Bar */}
              <div className="flex items-center gap-xs px-lg pt-md border-b border-outline-variant sticky top-0 bg-background z-10">
                {tabs.map((tab) => (
                  <div
                    key={tab.id}
                    className={`flex items-center gap-xs px-md py-sm rounded-t-lg cursor-pointer transition-colors select-none ${
                      activeTabId === tab.id
                        ? 'bg-surface-container text-on-surface border-b-2 border-primary'
                        : 'text-on-surface-variant hover:text-on-surface hover:bg-surface-container-highest'
                    }`}
                    onClick={() => setActiveTabId(tab.id)}
                  >
                    <span className="text-[14px] font-medium whitespace-nowrap">{tab.name}</span>
                    {tabs.length > 1 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleCloseTab(tab.id); }}
                        className="ml-xs p-0.5 rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-on-surface flex items-center justify-center"
                      >
                        <span className="material-symbols-outlined text-[14px]">close</span>
                      </button>
                    )}
                  </div>
                ))}
                {/* New Tab button */}
                <button
                  onClick={handleNewProject}
                  className="p-xs rounded hover:bg-surface-container-highest text-on-surface-variant hover:text-primary transition-colors flex items-center justify-center"
                  title="New Project"
                >
                  <span className="material-symbols-outlined text-[18px]">add</span>
                </button>
              </div>

              {/* Active Tab Content */}
              <div className="flex-1 flex justify-center p-lg">
                {tabs.map((tab) =>
                  activeTabId === tab.id ? (
                    <BuildCenterTab
                      key={tab.id}
                      tabId={tab.id}
                      onNameChange={(name) => handleTabNameChange(tab.id, name)}
                    />
                  ) : null,
                )}
              </div>
            </div>
          )}
          {activePage === 'settings' && (
            <div className="flex justify-center p-lg">
              <SettingsPage />
            </div>
          )}
        </main>
      </div>
    </ConfigProvider>
  );
}

export default App;
