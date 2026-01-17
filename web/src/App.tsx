import { useEffect, useState } from "react";
import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { fetchItems, syncNow, type Item } from "./api";
import { HomePage } from "./pages/HomePage";
import { RepoPage } from "./pages/RepoPage";

function App() {
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchItems();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  async function doSync() {
    setLoading(true);
    setError(null);
    try {
      await syncNow();
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  function onItemUpdated(updated: Item) {
    const key = `${updated.kind}:${updated.repoFullName}:${updated.key}`;
    setItems((prev) =>
      prev.map((x) =>
        `${x.kind}:${x.repoFullName}:${x.key}` === key ? updated : x,
      ),
    );
  }

  useEffect(() => {
    void refresh();
  }, []);

  return (
    <BrowserRouter>
      <div className="app">
        <Routes>
          <Route
            path="/"
            element={
              <HomePage
                items={items}
                loading={loading}
                error={error}
                onItemUpdated={onItemUpdated}
                onRefresh={refresh}
                onSync={doSync}
              />
            }
          />
          <Route
            path="/repo/:repoFullName"
            element={
              <RepoPage
                items={items}
                loading={loading}
                error={error}
                onItemUpdated={onItemUpdated}
                onRefresh={refresh}
                onSync={doSync}
              />
            }
          />
        </Routes>
      </div>
    </BrowserRouter>
  );
}

export default App;
